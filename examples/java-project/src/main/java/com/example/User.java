package com.example;

import java.util.List;
import java.util.ArrayList;

/**
 * Java project with intentional errors for LSP testing
 */
public class User {
    private String name;
    private int age;
    private String email;
    
    // Error: Missing constructor parameter
    public User(String name) {
        this.name = name;
        // Fixed: Using a default value instead of undefined variable
        this.age = 0;
    }
    
    // This method is intentionally correct to allow Main.java errors to be detected
    public String getName() {
        return name;
    }
    
    public void setAge(int age) {
        // Error: No validation for negative age
        this.age = age;
    }
    
    // Error: Method throws exception but not declared
    public void validateEmail(String email) {
        if (!email.contains("@")) {
            throw new IllegalArgumentException("Invalid email");
        }
        this.email = email;
    }
    
    // Error: Using raw List type instead of generic
    public List getUsers() {
        List users = new ArrayList();
        // Error: Adding different types to list
        users.add(new User("Alice"));
        users.add("Invalid user");
        return users;
    }
    
    // Error: Accessing undefined field
    public String getFullInfo() {
        return name + " is " + age + " years old, lives in " + city;
    }
    
    // Error: Method should be static
    public int calculateSum(int a, int b) {
        return a + b;
    }
    
    @Override
    public String toString() {
        // Error: Potential NPE - email might be null
        return "User{name='" + name + "', age=" + age + ", email=" + email.toLowerCase() + "}";
    }
}