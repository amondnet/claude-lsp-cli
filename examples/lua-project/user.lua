-- Lua project with intentional errors for LSP testing

local json = require("json")
local undefined_module = require("undefined_module")  -- Error: undefined module

local User = {}
User.__index = User

-- Error: Missing parameter validation
function User.new(name, age)
    local self = setmetatable({}, User)
    self.name = name
    self.age = age
    -- Error: Using undefined variable
    self.status = default_status
    return self
end

-- Error: Accessing undefined field
function User:get_info()
    return string.format("%s is %d years old, city: %s", 
                        self.name, self.age, self.city)
end

-- Error: No type checking for parameters
function User:update_age(new_age)
    -- Error: No validation for negative age or wrong type
    self.age = new_age
end

-- Error: Calling undefined function
function User:validate_email(email)
    if not string.find(email, "@") then
        return false
    end
    
    -- Error: undefined function
    return validate_email_format(email)
end

-- Error: Using undefined global variable
function User:get_category()
    if self.age < CHILD_MAX_AGE then
        return "child"
    elseif self.age < ADULT_MAX_AGE then
        return "adult"
    else
        return "senior"
    end
end

-- Error: Inconsistent return types
function User:is_adult()
    if self.age >= 18 then
        return "yes"  -- Should return boolean
    else
        return false
    end
end

-- Error: Calling method on potentially nil value
function User:process_data(data)
    -- Error: data might be nil
    local result = {}
    for k, v in pairs(data) do
        result[k] = string.upper(v)
    end
    
    -- Error: undefined function
    save_to_database(result)
    return result
end

-- Error: Using undefined table
function get_all_users()
    local users = {}
    -- Error: undefined global table
    for i, user_data in ipairs(global_user_list) do
        table.insert(users, User.new(user_data.name, user_data.age))
    end
    return users
end

-- Error: Accessing undefined variable
function main()
    -- Error: Wrong number of arguments
    local user = User.new("Alice")
    
    -- Error: Calling undefined method
    user:set_name("Alice Smith")
    
    -- Error: Wrong argument type
    user:update_age("twenty-five")
    
    -- Error: Using undefined variable
    print("Total users: " .. total_count)
    
    -- Error: Calling function on undefined object
    undefined_user:get_info()
    
    print(user:get_info())
end

return User