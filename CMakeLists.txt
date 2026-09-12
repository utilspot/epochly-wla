cmake_minimum_required(VERSION 3.19)
project(epochly-wla VERSION 1.0.0 LANGUAGES C)

include(GNUInstallDirs)

find_program(NPM_EXECUTABLE npm REQUIRED)
mark_as_advanced(NPM_EXECUTABLE)

if (WIN32)
  set(NPM_PREFIX "cmd" "/c")
endif ()

find_package(LibNetQ REQUIRED)
find_package(ICAL REQUIRED)

option(EPOCHLY_INSTALL_SERVER "Install the epochly server" ON)
option(EPOCHLY_INSTALL_MODULE "Install the epochly module" ON)
option(EPOCHLY_INSTALL_ASSETS "Install epochly supporting assets" ON)

set(EPOCHLY_BASE_URL "/" CACHE STRING "URL path prefix the epochly module is served under (a trailing slash is appended if missing)")
set(EPOCHLY_ROOT_URL "${EPOCHLY_BASE_URL}")
if(NOT EPOCHLY_ROOT_URL MATCHES "/$")
  set(EPOCHLY_ROOT_URL "${EPOCHLY_ROOT_URL}/")
endif()

set(EPOCHLY_SERVICE_URL "${EPOCHLY_ROOT_URL}time")
set(EPOCHLY_ASSETS_DIR "${CMAKE_INSTALL_DATADIR}/${PROJECT_NAME}")

set(EPOCHLY_DATAFILES
  config.h.in
  )

file(GLOB_RECURSE EPOCHLY_TSXFILES
  "src/*.ts"
  "src/*.tsx"
  )

set(EPOCHLY_DISTFILES
  dist/index.html
  dist/manifest.json
  )

add_custom_command(
  COMMAND ${NPM_PREFIX} "${NPM_EXECUTABLE}" install
  COMMAND ${NPM_PREFIX} "${NPM_EXECUTABLE}" run build --base-url=${EPOCHLY_BASE_URL}
  DEPENDS package.json ${EPOCHLY_TSXFILES}
  OUTPUT ${EPOCHLY_DISTFILES}
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  )

configure_file(config.h.in "${CMAKE_CURRENT_BINARY_DIR}/config.h" @ONLY)

source_group(TREE "${CMAKE_CURRENT_SOURCE_DIR}" FILES module.c ${EPOCHLY_DATAFILES} ${EPOCHLY_DISTFILES})
add_library(epochly_wla SHARED module.c ${EPOCHLY_DATAFILES} ${EPOCHLY_DISTFILES})
target_include_directories(epochly_wla PRIVATE "$<BUILD_INTERFACE:${CMAKE_CURRENT_BINARY_DIR}>")
target_link_libraries(epochly_wla PUBLIC LibNetQ::LibNetQ ICAL::ICAL)
set_property(TARGET epochly_wla PROPERTY POSITION_INDEPENDENT_CODE ON)
set_target_properties(epochly_wla PROPERTIES PREFIX "" IMPORT_PREFIX "")

source_group(TREE "${CMAKE_CURRENT_SOURCE_DIR}" FILES server.c)
add_executable(epochly_server server.c)
target_link_libraries(epochly_server PRIVATE LibNetQ::LibNetQ)

if (APPLE)
  set_target_properties(epochly_server PROPERTIES INSTALL_RPATH "@loader_path/../lib")
elseif (UNIX)
  set_target_properties(epochly_server PROPERTIES INSTALL_RPATH "$ORIGIN/../lib")
  target_link_options(epochly_server PRIVATE $<$<COMPILE_LANG_AND_ID:C,GNU,Clang,AppleClang>:-Wl,--disable-new-dtags>)
endif ()

if (EPOCHLY_INSTALL_SERVER)
  install(TARGETS epochly_server
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    )
endif ()

if (EPOCHLY_INSTALL_MODULE)
  install(TARGETS epochly_wla
    LIBRARY DESTINATION ${CMAKE_INSTALL_BINDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    )
endif ()

if (EPOCHLY_INSTALL_ASSETS)
  install(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist/"
    DESTINATION "${EPOCHLY_ASSETS_DIR}"
    )
endif ()
