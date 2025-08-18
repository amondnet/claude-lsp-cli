// Test file to verify LSP diagnostics work without authentication
const test: string = 123; // This should trigger a type error

function testFunction() {
  console.log("Testing LSP without auth tokens!");
  return undefinedVariable; // This should trigger an error
}

// Missing return type
function noReturnType(x) {
  return x * 2;
}