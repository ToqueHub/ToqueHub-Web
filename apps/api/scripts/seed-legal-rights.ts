async function main() {
  console.log('Legal rights seed disabled: advanced rights are not part of the active RH/Planning product.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
