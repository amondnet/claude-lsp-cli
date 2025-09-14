/**
 * Sample file contents for testing various programming languages
 */

/**
 * TypeScript file templates
 */
export const typescriptFiles = {
  /** Clean, error-free TypeScript */
  clean: `interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }
}

export { User, UserService };`,

  /** TypeScript with type errors */
  withTypeErrors: `interface User {
  id: number;
  name: string;
}

function createUser(name: string): User {
  return {
    id: "not-a-number", // Type error: string assigned to number
    name: name,
    age: 25 // Object literal may only specify known properties
  };
}

const user: User = createUser(123); // Type error: number assigned to string parameter
console.log(user.nonExistent); // Property error`,

  /** TypeScript with unused variables */
  withUnusedVars: `import { readFileSync } from 'fs'; // Unused import

function processData(): string {
  const unusedVariable = 'never used';
  const data = 'hello world';
  const anotherUnused = { value: 42 };
  
  return data;
}

const unusedConst = processData();
export { processData };`,

  /** Complex TypeScript with multiple issues */
  complex: `// Missing import for React
interface Props {
  title: string;
  count: number;
}

const Component: React.FC<Props> = ({ title, count, extra }) => { // Extra prop not in interface
  const [state, setState] = useState<string>(42); // Type error
  
  useEffect(() => {
    console.log('Effect running');
    // Missing dependency array
  });

  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count.toString()}</p>
      <p>Extra: {extra}</p>
    </div>
  );
};

export default Component;`,

  /** React TSX component */
  reactComponent: `import React, { useState, useEffect } from 'react';

interface TodoProps {
  id: number;
  text: string;
  completed: boolean;
  onToggle: (id: number) => void;
}

const Todo: React.FC<TodoProps> = ({ id, text, completed, onToggle }) => {
  return (
    <div className={completed ? 'completed' : 'pending'}>
      <input
        type="checkbox"
        checked={completed}
        onChange={() => onToggle(id)}
      />
      <span>{text}</span>
    </div>
  );
};

export default Todo;`,
};

/**
 * Python file templates
 */
export const pythonFiles = {
  /** Clean Python file */
  clean: `#!/usr/bin/env python3
"""A simple Python module for user management."""

from typing import List, Optional, Dict
import json

class User:
    def __init__(self, user_id: int, name: str, email: str):
        self.user_id = user_id
        self.name = name
        self.email = email
    
    def to_dict(self) -> Dict[str, str | int]:
        return {
            'id': self.user_id,
            'name': self.name,
            'email': self.email
        }

class UserManager:
    def __init__(self):
        self.users: List[User] = []
    
    def add_user(self, user: User) -> None:
        self.users.append(user)
    
    def find_user(self, user_id: int) -> Optional[User]:
        for user in self.users:
            if user.user_id == user_id:
                return user
        return None

if __name__ == "__main__":
    manager = UserManager()
    user = User(1, "John Doe", "john@example.com")
    manager.add_user(user)
    print(json.dumps(user.to_dict()))`,

  /** Python with type errors */
  withTypeErrors: `from typing import List, Dict

def process_users(users: List[str]) -> Dict[str, int]:
    result = {}
    for user in users:
        result[user] = len(user)
    return result

# Type errors
users = [1, 2, 3]  # Should be List[str] but is List[int]
result = process_users(users)  # Type mismatch

# More type issues
def calculate_age(birth_year: int) -> str:
    return 2024 - birth_year  # Should return str but returns int

age = calculate_age("1990")  # Should pass int but passes str
print(f"Age: {age}")`,

  /** Python with import issues */
  withImportErrors: `import os
import sys
import nonexistent_module  # Import error
from fake_package import something  # Import error

# Unused imports
import json
import re

def main():
    print("Hello, world!")
    # Using undefined variable
    print(undefined_variable)
    
    # Using undefined function
    result = undefined_function()
    return result

if __name__ == "__main__":
    main()`,

  /** Python with syntax errors */
  withSyntaxErrors: `def bad_function():
    print("Missing closing parenthesis"
    
def another_bad_function()  # Missing colon
    return "syntax error"

# Indentation error
def indentation_error():
print("Wrong indentation")

# Missing quotes
message = Hello, world!

# Invalid dictionary syntax
data = {
    "key1": "value1"
    "key2": "value2"  # Missing comma
}`,
};

/**
 * JavaScript file templates
 */
export const javascriptFiles = {
  /** Clean JavaScript */
  clean: `const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.post('/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const user = { id: Date.now(), name, email };
  res.status(201).json(user);
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});`,

  /** JavaScript with ESLint issues */
  withEslintErrors: `// Missing semicolon
const app = require('express')()

// Undefined variable
console.log(undefinedVariable)

// Unused variable
const unusedVar = 'never used';

// Missing quotes
const message = Hello, world!

// Inconsistent quotes
const mixed = "double" + 'single';

// Unreachable code
function example() {
  return true;
  console.log("This will never run");
}

// Missing function declaration
const result = missingFunction();`,
};

/**
 * Go file templates
 */
export const goFiles = {
  /** Clean Go file */
  clean: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
)

type User struct {
    ID    int    \`json:"id"\`
    Name  string \`json:"name"\`
    Email string \`json:"email"\`
}

func main() {
    http.HandleFunc("/users", handleUsers)
    fmt.Println("Server starting on :8080")
    http.ListenAndServe(":8080", nil)
}

func handleUsers(w http.ResponseWriter, r *http.Request) {
    user := User{
        ID:    1,
        Name:  "John Doe",
        Email: "john@example.com",
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}`,

  /** Go with compilation errors */
  withCompileErrors: `package main

import (
    "fmt"
    "unused" // Unused import
)

func main() {
    var unusedVar int // Unused variable
    fmt.Println("Hello")
    
    // Type mismatch
    var str string = 42
    
    // Undefined function
    undefinedFunction()
    
    // Undefined variable
    fmt.Println(undefinedVar)
}

// Missing return statement
func shouldReturnString() string {
    fmt.Println("No return")
}`,
};

/**
 * Language-specific test files
 */
export const languageFiles = {
  rust: {
    clean: `fn main() {
    let message = "Hello, Rust!";
    println!("{}", message);
    
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_addition() {
        assert_eq!(2 + 2, 4);
    }
}`,
    withErrors: `fn main() {
    let x = 5;
    let y = "hello";
    
    // Type mismatch
    let result = x + y;
    
    // Unused variable
    let unused = 42;
    
    // Borrowing error
    let mut vec = vec![1, 2, 3];
    let first = &vec[0];
    vec.push(4); // Error: cannot borrow as mutable
    println!("{}", first);
}`,
  },

  java: {
    clean: `public class HelloWorld {
    private String message;
    
    public HelloWorld(String message) {
        this.message = message;
    }
    
    public void printMessage() {
        System.out.println(this.message);
    }
    
    public static void main(String[] args) {
        HelloWorld hello = new HelloWorld("Hello, Java!");
        hello.printMessage();
    }
}`,
    withErrors: `public class ErrorExample {
    public static void main(String[] args) {
        // Type mismatch
        String number = 42;
        
        // Undefined variable
        System.out.println(undefinedVar);
        
        // Missing import
        List<String> list = new ArrayList<>();
        
        // Method not found
        String result = nonexistentMethod();
    }
}`,
  },

  php: {
    clean: `<?php
class User {
    private $id;
    private $name;
    private $email;
    
    public function __construct($id, $name, $email) {
        $this->id = $id;
        $this->name = $name;
        $this->email = $email;
    }
    
    public function getName() {
        return $this->name;
    }
    
    public function toArray() {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email
        ];
    }
}

$user = new User(1, "John Doe", "john@example.com");
echo json_encode($user->toArray());
?>`,
    withErrors: `<?php
// Syntax error - missing semicolon
$message = "Hello World"

// Undefined variable
echo $undefinedVariable;

// Undefined function
$result = nonexistentFunction();

// Type error (with strict types)
declare(strict_types=1);

function addNumbers(int $a, int $b): int {
    return $a + $b;
}

$result = addNumbers("5", "10"); // Type error
?>`,
  },

  scala: {
    clean: `object HelloWorld {
  case class User(id: Int, name: String, email: String)
  
  def main(args: Array[String]): Unit = {
    val user = User(1, "John Doe", "john@example.com")
    println(s"User: \${user.name} (\${user.email})")
    
    val users = List(
      User(1, "Alice", "alice@example.com"),
      User(2, "Bob", "bob@example.com")
    )
    
    val names = users.map(_.name)
    println(s"Names: \${names.mkString(", ")}")
  }
}`,
    withErrors: `object ErrorExample {
  def main(args: Array[String]): Unit = {
    // Type mismatch
    val number: Int = "not a number"
    
    // Undefined variable
    println(undefinedVariable)
    
    // Missing return type causes inference issues
    def problematicFunction = {
      if (true) 42
      else "string"
    }
    
    val result = problematicFunction
  }
}`,
  },
};

/**
 * Configuration file templates
 */
export const configFiles = {
  /** Package.json with dependencies */
  packageJson: `{
  "name": "test-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.0",
    "@types/express": "^4.17.0"
  }
}`,

  /** TSConfig.json */
  tsconfigJson: `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,

  /** Python requirements.txt */
  requirementsTxt: `fastapi>=0.68.0
uvicorn>=0.15.0
pydantic>=1.8.0
sqlalchemy>=1.4.0
psycopg2-binary>=2.9.0`,

  /** Go mod file */
  goMod: `module example.com/myproject

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/joho/godotenv v1.4.0
)`,

  /** Cargo.toml for Rust */
  cargoToml: `[package]
name = "my-project"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
reqwest = { version = "0.11", features = ["json"] }`,
};

/**
 * Helper function to create file content for testing
 */
export function createFileContent(
  language: string,
  scenario: 'clean' | 'withErrors' | 'complex' = 'clean'
): string {
  const languageMap: { [key: string]: any } = {
    typescript: typescriptFiles,
    javascript: javascriptFiles,
    python: pythonFiles,
    go: goFiles,
    rust: languageFiles.rust,
    java: languageFiles.java,
    php: languageFiles.php,
    scala: languageFiles.scala,
  };

  const files = languageMap[language];
  if (!files) {
    throw new Error(`Unknown language: ${language}`);
  }

  const content = files[scenario] || files.clean;
  if (!content) {
    throw new Error(`Unknown scenario: ${scenario} for language: ${language}`);
  }

  return content;
}

/**
 * Common file extensions for testing
 */
export const fileExtensions = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
  python: ['.py', '.pyw'],
  go: ['.go'],
  rust: ['.rs'],
  java: ['.java'],
  php: ['.php'],
  scala: ['.scala', '.sc'],
  cpp: ['.cpp', '.cxx', '.cc', '.c++'],
  c: ['.c', '.h'],
  lua: ['.lua'],
  elixir: ['.ex', '.exs'],
};
