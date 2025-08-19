const x = undefined_variable;  // Undefined variable
function test() {
  return this.nonexistent.property;  // Potential null reference
}
test(1, 2, 3, 4, 5);  // Too many arguments