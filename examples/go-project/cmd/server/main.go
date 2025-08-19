package main

import (
	"fmt"
	"log"
	"net/http"
	"go-real-test/internal/handlers"
	"go-real-test/internal/models"
)

// Intentional errors for testing
func main() {
	// Type error: assigning string to int
	var port int = "8080"
	
	// Error: undefined variable
	fmt.Println("Starting server on port:", undefinedPort)
	
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
}