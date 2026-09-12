#include "config.h"

#define NQ_LOG_TAG "epochly"

#include <libnetq/Log.h>
#include <libnetq/String.h>
#include <libnetq/Library.h>
#include <libnetq/fs/Path.h>
#include <libnetq/ErrorCode.h>
#include <libnetq/http/HttpHeader.h>
#include <libnetq/http/HttpMethod.h>
#include <libnetq/http/HttpStatus.h>
#include <libnetq/http/MediaType.h>
#include <libnetq/Module.h>
#include <libnetq/Malloc.h>
#include <libnetq/ByteBuffer.h>
#include <libnetq/MinMax.h>
#include <libnetq/JSON.h>
#include <libnetq/http/HttpRequest.h>
#include <libnetq/web/WebRequest.h>
#include <libnetq/web/WebResponse.h>
#include <libnetq/web/WebServer.h>
#include <libnetq/web/WebManifest.h>
#include <libnetq/Time.h>

#include <libical/ical.h>

typedef struct WebEpochlyExecutor WebEpochlyExecutor;
struct WebEpochlyExecutor {
  NQWebExecutor executor;
  NQWebManifestListeners manifestListeners;
  struct NQWebRequestListener icalListener;
  /* Serialized once in executorInit (see buildTimezonesJson) and served
   * as-is by every {"method":"timezones"} request - libical's builtin
   * timezone table doesn't change at runtime, so there's no reason to
   * rebuild this per request. */
  NQByteBuffer timezonesJson;
};

/* Per-request state: accumulates the POST body so requestIcalHandler can
 * read it once it's complete, plus a link back to the executor for the
 * "timezones" method's cached response. */
typedef struct TimeRequestContext TimeRequestContext;
struct TimeRequestContext {
  struct WebEpochlyExecutor* epochly;
  NQByteBuffer body;
};

static bool responseJsonWrite(void* userdata, const char* characters, size_t size)
{
  NQWebResponse* response = (NQWebResponse*)userdata;
  return NQWebResponse_write(response, characters, size) >= 0;
}

static bool byteBufferJsonWrite(void* userdata, const char* characters, size_t size)
{
  NQByteBuffer* buffer = (NQByteBuffer*)userdata;
  NQByteBuffer_append(buffer, (const uint8_t*)characters, size);
  return true;
}

static int writeError(NQWebResponse* response, int status, const char* kind, const char* message)
{
  NQJSONWriter writer;
  NQJSONWriter_init(&writer, &responseJsonWrite, response);
  NQJSONWriter_writeObjectBegin(&writer);
  NQJSONWriter_writeKeyString(&writer, "error", message);
  if (kind != NULL)
    NQJSONWriter_writeKeyString(&writer, "kind", kind);
  NQJSONWriter_writeObjectEnd(&writer);
  NQJSONWriter_finalize(&writer);
  return status;
}

/*
 * Writes `tt` (resolved against `zone`) as the same JSON shape the UI's
 * emulation server hands back (see server/presets.js and
 * src/types/time.ts#CurrentTimeResponse): an iCalendar string, the
 * individual icaltimetype components, the Unix epoch, and an ISO-8601
 * string - so the client works unmodified against either backend.
 */
static void writeIcalTime(NQJSONWriter* writer, struct icaltimetype tt, icaltimezone* zone)
{
  int isDaylight = 0;
  int utcOffsetSeconds = icaltimezone_get_utc_offset(zone, &tt, &isDaylight);

  char* icalString = icaltime_as_ical_string_r(tt);
  /* icaltime_as_timet() ignores tt.zone entirely and reinterprets tt's local
   * wall-clock fields as if they were already UTC - for any non-UTC zone
   * that silently shifts epoch/isoString by the zone's UTC offset (e.g. an
   * hour into the future for a +1h zone) while components.hour stays
   * correct, so the two disagree. icaltime_as_timet_with_zone() converts
   * tt's local fields back to a true UTC instant using `zone`, which is
   * what these are supposed to reflect. */
  time_t epoch = icaltime_as_timet_with_zone(tt, zone);

  struct tm gmt;
  NQGmtime(&epoch, &gmt);
  char isoString[32];
  strftime(isoString, sizeof(isoString), "%Y-%m-%dT%H:%M:%SZ", &gmt);

  const char* timezone = icaltime_is_utc(tt) ? "UTC" : (zone != NULL ? icaltimezone_get_tzid(zone) : "floating");

  NQJSONWriter_writeKeyString(writer, "icalString", icalString);
  free(icalString);

  NQJSONWriter_writeKeyObjectBegin(writer, "components");
  NQJSONWriter_writeKeyInt32(writer, "year", tt.year);
  NQJSONWriter_writeKeyInt32(writer, "month", tt.month);
  NQJSONWriter_writeKeyInt32(writer, "day", tt.day);
  NQJSONWriter_writeKeyInt32(writer, "hour", tt.hour);
  NQJSONWriter_writeKeyInt32(writer, "minute", tt.minute);
  NQJSONWriter_writeKeyInt32(writer, "second", tt.second);
  NQJSONWriter_writeKeyBool(writer, "isDate", tt.is_date != 0);
  NQJSONWriter_writeKeyBool(writer, "isUtc", icaltime_is_utc(tt) != 0);
  NQJSONWriter_writeKeyBool(writer, "isDaylight", isDaylight != 0);
  NQJSONWriter_writeKeyString(writer, "timezone", timezone);
  NQJSONWriter_writeKeyInt32(writer, "utcOffsetSeconds", utcOffsetSeconds);
  NQJSONWriter_writeObjectEnd(writer);

  /* time_t can outgrow 32 bits past January 2038 (see the emulation
   * server's "y2038-edge" preset), so this needs the 64-bit writer. */
  NQJSONWriter_writeKeyInt64(writer, "epochSeconds", (int64_t)epoch);
  NQJSONWriter_writeKeyString(writer, "isoString", isoString);
}

static int requestIcalInit(NQWebRequest* request, void* data)
{
  TimeRequestContext* ctx = (TimeRequestContext*)NQMalloc(sizeof(*ctx));
  if (ctx == NULL)
    return -NQ_ENOMEM;

  ctx->epochly = (struct WebEpochlyExecutor*)data;
  NQByteBuffer_init(&ctx->body);
  request->userdata = ctx;
  return 0;
}

static size_t requestIcalReceive(NQWebRequest* request, const char* data, size_t size)
{
  TimeRequestContext* ctx = (TimeRequestContext*)request->userdata;
  (void)NQByteBuffer_append(&ctx->body, (const uint8_t*)data, size);
  return size;
}

static void requestIcalRelease(NQWebRequest* request)
{
  TimeRequestContext* ctx = (TimeRequestContext*)request->userdata;
  if (ctx == NULL)
    return;
  NQByteBuffer_finalize(&ctx->body);
  NQFree(ctx);
  request->userdata = NULL;
}

/*
 * Handles {"method": "timet", "timet": <unix seconds>, "timezone": "<IANA id>"}
 * (or an empty/absent body, which is treated the same as this method with
 * neither field set): "timet" defaults to now, "timezone" to UTC. `json`
 * may be NULL (no body was sent).
 */
static int writeTimeMethod(NQWebResponse* response, NQJSON* json)
{
  time_t timet = time(NULL);
  icaltimezone* zone = icaltimezone_get_utc_timezone();

  if (json != NULL && NQJSON_isObject(json)) {
    int64_t timetValue = 0;
    if (NQJSON_objectGetInt64(json, "timet", &timetValue)) {
      timet = (time_t)timetValue;
    }

    const char* timezone = NULL;
    if (NQJSON_objectGetString(json, "timezone", &timezone) && timezone != NULL && timezone[0] != '\0') {
      icaltimezone* requested = icaltimezone_get_builtin_timezone(timezone);
      if (requested == NULL) {
        return writeError(response, NQ_HTTP_BAD_REQUEST, NULL,
                           "Unrecognized \"timezone\" - expected an IANA timezone id, e.g. \"Europe/London\"");
      }
      zone = requested;
    }
  }

  struct icaltimetype tt = icaltime_from_timet_with_zone(timet, 0 /* is_date */, zone);

  NQJSONWriter writer;
  NQJSONWriter_init(&writer, &responseJsonWrite, response);
  NQJSONWriter_writeObjectBegin(&writer);
  writeIcalTime(&writer, tt, zone);
  NQJSONWriter_writeObjectEnd(&writer);

  if (writer.hasError) {
    NQ_LOGE("failed to serialise " EPOCHLY_SERVICE_URL " \"timet\" response JSON");
    NQJSONWriter_finalize(&writer);
    return NQ_HTTP_INTERNAL_SERVER_ERROR;
  }

  NQJSONWriter_finalize(&writer);
  return NQ_HTTP_OK;
}

/* Handles {"method": "timezones"}: writes the cached buffer built once by
 * buildTimezonesJson, unchanged, no re-serialization per request. */
static int writeTimezonesMethod(NQWebResponse* response, struct WebEpochlyExecutor* epochly)
{
  NQWebResponse_write(response, (const char*)NQByteBuffer_data(&epochly->timezonesJson),
                       NQByteBuffer_size(&epochly->timezonesJson));
  return NQ_HTTP_OK;
}

static int requestIcalHandler(NQWebRequest* request, NQWebResponse* response)
{
  TimeRequestContext* ctx = (TimeRequestContext*)request->userdata;

  NQWebResponse_setHeader(response, NQHTTP_HEADER_CONTENT_TYPE, NQ_MEDIATYPE_APPLICATION_JSON);

  NQJSON* json = NULL;
  if (!NQByteBuffer_isEmpty(&ctx->body)) {
    json = NQJSON_parse2((const char*)NQByteBuffer_data(&ctx->body), NQByteBuffer_size(&ctx->body));
    if (json == NULL) {
      return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Request body is not valid JSON");
    }
  }

  /* "method" selects the response shape; absent defaults to "timet" so a
   * bare POST (or {"timezone": ...}/{"timet": ...} with no "method") keeps
   * working exactly as before this was added. */
  const char* method = NULL;
  if (json != NULL && NQJSON_isObject(json)) {
    NQJSON_objectGetString(json, "method", &method);
  }

  int status;
  if (method == NULL || NQStrcmp(method, "timet") == 0) {
    status = writeTimeMethod(response, json);
  } else if (NQStrcmp(method, "timezones") == 0) {
    status = writeTimezonesMethod(response, ctx->epochly);
  } else {
    status = writeError(response, NQ_HTTP_BAD_REQUEST, NULL,
                         "Unrecognized \"method\" - expected \"timet\" or \"timezones\"");
  }

  if (json != NULL)
    NQJSON_release(json);

  return status;
}

static const NQWebRequestOperations kIcalOps = {
  .init = requestIcalInit,
  .receive = requestIcalReceive,
  .handler = requestIcalHandler,
  .release = requestIcalRelease,
};

/*
 * Serializes every timezone libical ships as {"timezones": ["Africa/Cairo",
 * ...]} into `epochly->timezonesJson`, once, so the "timezones" method
 * never has to walk icaltimezone_get_builtin_timezones() (which reads the
 * compiled-in tzdata) per request.
 */
static void buildTimezonesJson(struct WebEpochlyExecutor* epochly)
{
  NQByteBuffer_init(&epochly->timezonesJson);

  NQJSONWriter writer;
  NQJSONWriter_init(&writer, &byteBufferJsonWrite, &epochly->timezonesJson);
  NQJSONWriter_writeObjectBegin(&writer);
  NQJSONWriter_writeKeyArrayBegin(&writer, "timezones");

  icalarray* builtins = icaltimezone_get_builtin_timezones();
  for (int i = 0; i < builtins->num_elements; i++) {
    icaltimezone* zone = (icaltimezone*)icalarray_element_at(builtins, i);
    /* Only zones with a clean "Region/City" LOCATION are usable IANA ids on
     * the way back out (icaltimezone_get_builtin_timezone, and the client's
     * Intl.DateTimeFormat). A handful of legacy builtins have no LOCATION
     * and only a vendor-prefixed TZID instead, e.g.
     * "/freeassociation.sourceforge.net/Europe/London" - not a real
     * timezone id, so those are skipped rather than exposed. */
    const char* id = icaltimezone_get_location(zone);
    if (id == NULL || id[0] == '\0' || id[0] == '/')
      continue;
    NQJSONWriter_writeString(&writer, id);
  }

  NQJSONWriter_writeArrayEnd(&writer);
  NQJSONWriter_writeObjectEnd(&writer);
  NQJSONWriter_finalize(&writer);
}

static int executorInit(NQWebExecutor* executor, void* data)
{
  NQ_UNUSED_PARAM(data);

  struct WebEpochlyExecutor* epochly = (struct WebEpochlyExecutor*)executor;

  NQLibraryInfo info;
  int ret = NQLibraryInfoLoad(&info, &executorInit);
  if (ret != 0) {
    return ret;
  }
  NQPath* manifest = NQPath_join3(info.filename, "../../" EPOCHLY_ASSETS_DIR, NQ_WEBMANIFEST_FILE);
  NQLibraryInfoFinalize(&info);
  if (manifest == NULL) {
    return -NQ_ENOMEM;
  }

  ret = NQWebManifestListenersInit(executor, &epochly->manifestListeners, NQPath_characters(manifest));
  NQPath_destroy(manifest);
  if (ret != 0) {
    return ret;
  }

  buildTimezonesJson(epochly);

  ret = NQWebExecutor_addRequestListener(&epochly->executor, &epochly->icalListener, &kIcalOps, epochly, NQ_HTTP_POST, EPOCHLY_SERVICE_URL);
  if (ret != 0) {
    NQByteBuffer_finalize(&epochly->timezonesJson);
    NQWebManifestListenersFinalize(&epochly->executor, &epochly->manifestListeners);
    return ret;
  }

  return ret;
}

static void executorRelease(NQWebExecutor* executor)
{
  struct WebEpochlyExecutor* epochly = (struct WebEpochlyExecutor*)executor;
  NQWebExecutor_removeRequestListener(&epochly->executor, &epochly->icalListener);
  NQByteBuffer_finalize(&epochly->timezonesJson);
  NQWebManifestListenersFinalize(&epochly->executor, &epochly->manifestListeners);
}

static struct NQWebExecutorOperations s_executorOps = {
  .name = "epochly",
  .init = executorInit,
  .release = executorRelease,
  .size = sizeof(struct WebEpochlyExecutor),
};

static int moduleInit(NQContext* context)
{
  NQ_UNUSED_PARAM(context);

  /* libical tags TZIDs it generates for builtin zones with a namespace
   * prefix (default "/freeassociation.sourceforge.net/") per RFC 5545's
   * global-uid convention. That's meant for VTIMEZONE interchange, not for
   * this service's plain-IANA-id responses, so clear it before anything
   * (buildTimezonesJson, any writeIcalTime call) resolves or loads a
   * timezone - icaltimezone_get_tzid() would otherwise hand back
   * "/freeassociation.sourceforge.net/Europe/London" instead of
   * "Europe/London". This is a process-global libical setting, so it only
   * needs to be done once here. */
  icaltimezone_set_tzid_prefix("");

  return NQWebExecutorRegister(&s_executorOps);
}

static void moduleExit(NQContext* context)
{
  NQ_UNUSED_PARAM(context);
  NQWebExecutorUnregister(&s_executorOps);
}

NQ_MODULE_INIT(moduleInit);
NQ_MODULE_EXIT(moduleExit);
