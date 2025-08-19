defmodule Main do
  # Error: Importing undefined module
  alias UndefinedModule
  
  def main do
    # Error: Wrong number of arguments
    user = User.new("Alice", 25, "extra")
    
    # Error: Calling undefined function
    User.set_name(user, "Alice Smith")
    
    # Error: Wrong argument type
    User.update_age(user, "twenty-five")
    
    # Error: Using undefined variable
    IO.puts("Total users: #{total_count}")
    
    # Error: Calling function on undefined variable
    undefined_user |> User.get_info() |> IO.puts()
    
    # Error: Using undefined module function
    UndefinedModule.process(user)
    
    # Error: Pattern matching with wrong structure
    case user do
      %WrongStruct{name: name} -> IO.puts("Name: #{name}")
      _ -> IO.puts("Unknown user")
    end
    
    IO.puts(User.get_info(user))
  end
  
  # Error: Using undefined function in guard
  def validate_input(input) when is_valid_string(input) do
    {:ok, input}
  end
  
  def validate_input(_input) do
    {:error, "Invalid input"}
  end
end