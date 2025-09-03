import express from 'express';
import { UserService } from './services/UserService';
import { DatabaseConnection } from './database/Connection';

// Intentional errors for testing - 10+ errors to test 5-item limit
const app = express();
const port: string = 3000; // Type error: should be number

// More intentional errors
const error1: number = "string1"; // Type error 1
const error2: boolean = 123; // Type error 2  
const error3: string = true; // Type error 3
const error4: number[] = "not an array"; // Type error 4
const error5: object = 456; // Type error 5

// Undefined variables
console.debug(undefinedVar1); // Undefined 1
console.debug(undefinedVar2); // Undefined 2
console.debug(undefinedVar3); // Undefined 3

interface User {
  id: number;
  name: string;
  email: string;
}

class Server {
  private userService: UserService;
  
  constructor() {
    this.userService = new UserService();
    this.setupRoutes();
  }
  
  private setupRoutes(): void {
    app.get('/users', async (req, res) => {
      try {
        const users = await this.userService.getAllUsers();
        res.json(users);
      } catch (error) {
        console.debug(unknownVariable); // Error: undefined variable
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    app.get('/users/:id', async (req, res) => {
      const userId: string = req.params.id; // Should be number
      const user = await this.userService.getUserById(userId); // Type mismatch
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    });
  }
  
  public start(): void {
    app.listen(port, () => {
      console.debug(`Server running on port ${port}`);
      this.nonExistentMethod(); // Error: method doesn't exist
    });
  }
}

const server = new Server();
server.start();

// Essential test errors for LSP diagnostics (keep these for testing)
const typeError: string = 123; // Type mismatch error for testing
const anotherTypeError: number = "hello"; // Another type error for testing

// Adding new errors to trigger diagnostics
const newError1: boolean = 42; // Type error: number to boolean
const newError2: string[] = { name: "test" }; // Type error: object to string array
const newError3: Date = "not a date"; // Type error: string to Date

// Function with wrong return type
function getNumber(): number {
  return "I should return a number"; // Type error in return
}

// Unused variable and wrong assignment
let unusedVar: number;
const wrongAssign: readonly string[] = ["a", "b"];
wrongAssign.push("c"); // Error: cannot push to readonly array

// Adding a new error after session restart to test diagnostics
const testAfterRestart: boolean = "this should be boolean but is string"; // Type error
function missingReturn(): string {
  // Missing return statement - should return string
}

// Testing from correct directory - should trigger diagnostics now!
const fromCorrectDir: number = "testing from typescript-project directory"; // Type error

// Testing after reinstall and restart - checking CWD logging
const afterReinstall: string = 123; // Another type error to trigger hook

// Test dedup issue - adding a comment to trigger hook
const dedupTest: boolean = "not a boolean"; // Type error

// Testing fd-based project discovery - should find this TypeScript project!
const fdDiscoveryTest: number = "This should trigger diagnostics with fd"; // Type error

// Test change to trigger diagnostics system
const testDiagnostics: number = "This should trigger a type error"; // New type error

// Testing after session restart with Bun-based discovery
const bunDiscoveryTest: boolean = "Should trigger diagnostics with new implementation"; // Type error

// Testing from parent directory - project discovery should work!
const parentDirTest: string = 42; // Type error from parent dir
const testNewFormat: number = "testing relative paths now";
