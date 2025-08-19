<?php

namespace App;

class User
{
    private int $id;
    private string $name;
    private string $email;
    private \DateTime $createdAt;

    public function __construct(int $id, string $name, string $email)
    {
        $this->id = $id;
        $this->name = $name;
        $this->email = $email;
        // Error: calling undefined method
        $this->createdAt = $this->getCurrentTimestamp();
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    // Error: wrong return type
    public function getCreatedAt(): string
    {
        return $this->createdAt; // Should return DateTime, not string
    }

    // Error: accessing undefined property
    public function getFullInfo(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'age' => $this->age, // Property doesn't exist
            'created_at' => $this->createdAt->format('Y-m-d H:i:s')
        ];
    }

    // Error: undefined method call
    public function save(): bool
    {
        $database = new Database();
        return $database->saveUser($this); // Database class doesn't exist
    }
}