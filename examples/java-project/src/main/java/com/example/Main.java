package com.example;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        // Error: Passing wrong number of arguments to constructor
        User user1 = new User("Alice", 25);
        
        // Error: Calling undefined method
        user1.setName("Alice Smith");
        
        // Error: Wrong argument type
        user1.setAge("twenty-five");
        
        // Error: Not handling checked exception
        user1.validateEmail("invalid-email");
        
        // Error: Using undefined variable
        System.out.println("User count: " + userCount);
        
        // Error: Calling method on potentially null object
        String info = user1.getFullInfo();
        User nullUser = null;
        System.out.println(nullUser.getName());
    }
}