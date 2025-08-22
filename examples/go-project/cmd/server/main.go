package main

import (
	"fmt"
	"log"
	"net/http"
	"go-real-test/internal/handlers"
	"go-real-test/internal/models"
)

// Intentional errors for testing - 10+ errors for diagnostic limit testing
func main() {
	// Type errors (errors 1-5)
	var port int = "8080"
	var num1 int = "string"
	var num2 float64 = "text"
	var bool1 bool = 123
	var str1 string = 456
	
	// Undefined variables (errors 6-12)
	fmt.Println("Starting server on port:", undefinedPort)
	fmt.Println(undefinedVar1)
	fmt.Println(undefinedVar2)
	fmt.Println(undefinedVar3)
	fmt.Println(undefinedVar4)
	fmt.Println(undefinedVar5)
	fmt.Println(undefinedVar6)
	
	userHandler := handlers.NewUserHandler()
	
	http.HandleFunc("/users", userHandler.GetUsers)
	http.HandleFunc("/users/create", userHandler.CreateUser)
	
	// Error: calling non-existent method
	http.HandleFunc("/health", userHandler.HealthCheck())
	
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: nil,
	}
	
	log.Printf("Server starting on port %d", port)
	
	// Error: accessing non-existent field
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("Server failed:", err.Message)
	}
}// trigger
