cmake_minimum_required(VERSION 3.16)
project(CppRealTest)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

add_executable(cpp_real_test
    src/main.cpp
    src/User.cpp
    src/Database.cpp
)

# Add compiler warnings
target_compile_options(cpp_real_test PRIVATE
    -Wall -Wextra -Wpedantic -Werror
)