# Elixir project with intentional errors for LSP testing
defmodule User do
  # Error: Importing undefined module
  import UndefinedModule
  
  defstruct [:name, :age, :email]
  
  # Error: Using undefined variable in pattern match
  def new(name, age) do
    %User{
      name: name,
      age: age,
      # Error: Using undefined variable
      status: default_status
    }
  end
  
  # Error: Function with wrong arity called
  def get_info(user) do
    # Error: Accessing undefined field
    "#{user.name} is #{user.age} years old, lives in #{user.city}"
  end
  
  # Error: Pattern match with wrong struct
  def update_age(%WrongStruct{} = user, new_age) do
    # Error: No age validation
    %{user | age: new_age}
  end
  
  # Error: Calling undefined function
  def validate_email(user, email) do
    if String.contains?(email, "@") do
      # Error: undefined function call
      validate_email_format(email)
      %{user | email: email}
    else
      {:error, "Invalid email"}
    end
  end
  
  # Error: Using undefined module constant
  def get_category(%User{age: age}) do
    cond do
      age < @child_max_age -> :child
      age < @adult_max_age -> :adult
      true -> :senior
    end
  end
  
  # Error: Inconsistent return types
  def is_adult?(%User{age: age}) do
    if age >= 18 do
      "yes"  # Should return boolean
    else
      false
    end
  end
  
  # Error: Pattern matching on potentially nil
  def process_data(nil), do: {:error, "No data"}
  def process_data(data) do
    # Error: Calling undefined function
    result = transform_data(data)
    
    # Error: Using undefined module
    UndefinedDatabase.save(result)
    {:ok, result}
  end
  
  # Error: Wrong function head arity
  def calculate_score(user, base_score, bonus) do
    # Error: Using undefined variable
    user.age * base_score + bonus + default_bonus
  end
  
  # Error: Using wrong operator for string concatenation
  def format_name(%User{name: name}) do
    # Error: Should use <> for string concatenation
    "Mr/Ms " + name
  end
end