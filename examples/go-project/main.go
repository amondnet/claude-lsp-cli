package main

import (
    "fmt"
    "undefined_package"  // This package doesn't exist - intentional error
)

func main() {
    // Type mismatch error
    var count int = "not a number"  // string cannot be assigned to int

    // Undefined variable
    fmt.Println(undefinedVariable)

    // Wrong number of arguments
    result := add(1, 2, 3)  // add function only takes 2 arguments
    fmt.Println(result)

    // Using undefined function
    doSomething()
}

func add(a int, b int) int {
    return a + b
}

// Missing return statement
func divide(a, b float64) float64 {
    if b == 0 {
        fmt.Println("Cannot divide by zero")
        // Missing return here - intentional error
    }
    return a / b
}