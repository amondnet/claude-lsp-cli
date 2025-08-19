# Ruby project with intentional errors for LSP testing
require 'json'
require 'undefined_gem'  # Error: undefined gem

class User
  attr_reader :name, :age
  
  def initialize(name, age)
    @name = name
    @age = age
    # Error: Using undefined instance variable
    @status = default_status
  end
  
  # Error: Method name uses undefined variable
  def get_info
    # Error: Using undefined local variable
    "#{@name} is #{@age} years old, status: #{current_status}"
  end
  
  # Error: Missing parameter type validation
  def update_age(new_age)
    # Error: No validation for negative age
    @age = new_age
  end
  
  # Error: Calling undefined method
  def validate_email(email)
    return false unless email.include?('@')
    
    # Error: Using undefined method
    email.validate_format!
    true
  end
  
  # Error: Using undefined constant
  def get_category
    case @age
    when 0..CHILD_MAX_AGE
      'child'
    when CHILD_MAX_AGE..ADULT_MAX_AGE
      'adult'
    else
      'senior'
    end
  end
  
  # Error: Method should return boolean but returns string
  def is_adult?
    @age >= 18 ? 'yes' : 'no'
  end
  
  # Error: Accessing undefined method on nil
  def process_data(data)
    # Error: data might be nil
    result = data.transform_values(&:upcase)
    
    # Error: undefined method
    result.save_to_database
  end
  
  private
  
  # Error: Private method called from public method above
  def default_status
    'active'
  end
end