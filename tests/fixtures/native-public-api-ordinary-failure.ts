process.stdout.write("{\n  \"actual\": \"ordinary failure\"\n}\n");
process.stderr.write("actual child stderr\n");
process.exitCode = 7;
