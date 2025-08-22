// Bun-specific project with intentional errors for testing
// This tests that Bun globals work and diagnostics are limited to 5 items

// Bun-specific APIs with errors
const file1 = Bun.file(123); // Error: expects string path
const server = Bun.serve({
  port: "3000", // Error: port should be number
  fetch(request) { // Error: missing return
    console.log(request.url);
  }
});

// Type errors 
const error1: number = "string"; // Type error 1
const error2: boolean = 123; // Type error 2
const error3: string = true; // Type error 3
const error4: Bun.Server = "not a server"; // Type error 4
const error5: Response = 456; // Type error 5

// Undefined variables (should be 10+ errors total)
console.log(undefinedVar1); // Undefined 1
console.log(undefinedVar2); // Undefined 2
console.log(undefinedVar3); // Undefined 3
console.log(undefinedVar4); // Undefined 4
console.log(undefinedVar5); // Undefined 5

// Bun-specific incorrect usage
const hash1 = Bun.hash(123); // Error: expects string or buffer
const env1: number = Bun.env.HOME; // Error: env values are string | undefined
await Bun.write(123, "content"); // Error: first arg should be string path

// Function with wrong return type
function getBunVersion(): number {
  return Bun.version; // Error: Bun.version is string
}

// Using Bun.spawn incorrectly
const proc = Bun.spawn(["echo"], {
  stdio: "wrong" // Error: invalid stdio option
});

// More type mismatches
const wrongType1: Buffer = Bun.file("test.txt"); // Error: Bun.file returns BunFile
const wrongType2: string = await Bun.stdin.text; // Error: text is a method
const wrongType3: number = Bun.main; // Error: Bun.main is boolean// test per-language limiting
