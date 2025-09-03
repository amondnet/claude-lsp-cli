// This file contains intentional TypeScript errors for testing
// Uses Bun-specific features like import.meta and Bun global

import { join } from "path";

// Using import.meta (Bun feature)
const currentDir = import.meta.dir;
const currentFile = import.meta.file;

// Using Bun global
const server = Bun.serve({
  port: 3000,
  fetch(request) {
    // Intentional type error: returning wrong type
    const wrongReturn: string = 123; // Error: Type 'number' is not assignable to type 'string'
    return wrongReturn; // Error: Type 'string' is not assignable to type 'Response | Promise<Response>'
  },
});

// Top-level await (supported in Bun)
const data = await fetch("https://example.com").then(r => r.text());

// More intentional errors
let str: string = "hello";
str = 42; // Error: Type 'number' is not assignable to type 'string'

interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "John",
  age: "30", // Error: Type 'string' is not assignable to type 'number'
};

// Accessing non-existent property
console.log(user.email); // Error: Property 'email' does not exist on type 'User'

// Using undefined variable
console.log(undefinedVariable); // Error: Cannot find name 'undefinedVariable'

export { server };