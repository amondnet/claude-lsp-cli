#!/usr/bin/env ruby

require_relative 'lib/user'
require 'undefined_library'  # Error: undefined library

def main
  # Error: Wrong number of arguments
  user = User.new("Alice")
  
  # Error: Calling undefined method
  user.set_name("Alice Smith")
  
  # Error: Wrong argument type
  user.update_age("twenty-five")
  
  # Error: Using undefined variable
  puts "Total users: #{total_count}"
  
  # Error: Calling method on undefined object
  undefined_user.get_info
  
  # Error: Using undefined local variable
  puts user_list.length
  
  # Error: Calling undefined method
  user.delete_account!
  
  puts user.get_info
end

# Error: Calling undefined method
if __FILE__ == $PROGRAM_NAME
  main()
end