#!/usr/bin/env lua

local User = require("user")
local undefined_lib = require("undefined_lib")  -- Error: undefined library

-- Error: Using undefined function
function init_system()
    setup_database()  -- Error: undefined function
    
    -- Error: undefined global
    print("System version: " .. SYSTEM_VERSION)
end

function main()
    init_system()
    
    -- Error: Wrong arguments to constructor
    local user1 = User.new("Alice", 25, "extra_param")
    
    -- Error: Calling undefined method
    user1:set_email("alice@example.com")
    
    -- Error: Wrong type for age
    user1:update_age("thirty")
    
    -- Error: Using undefined variable
    print("App name: " .. app_name)
    
    -- Error: Calling method on undefined object
    local info = nil_user:get_info()
    
    -- Error: Using undefined table
    for i, user in ipairs(user_database) do
        print(user:get_info())
    end
    
    print(user1:get_info())
end

-- Error: Calling undefined function
if _MAIN then
    main()
end

-- Syntax errors for testing luac
function broken_syntax()
    local x = 10
    if x > 5 then
        print("x is greater than 5"
        -- Missing closing parenthesis above
    end
    
    -- Unclosed string
    local str = "this string is not closed
    
    -- Invalid syntax - missing 'then'
    if true
        print("missing then")
    end
end