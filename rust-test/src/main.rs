fn main() {
    let x: String = 123;  // Type error: i32 to String
    println!("{}", undefined_var);  // Undefined variable
    non_existent_function();  // Undefined function
    let y = x + 5;  // Type mismatch in operation
}