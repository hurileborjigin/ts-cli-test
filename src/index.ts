#!/usr/bin/env node

import {Command} from "commander";

// Declare the program
const program = new Command();


// Add actions to that CLI
program.action(() => {
    console.log("hello from ts-cli-test");
}).description("Say Hello")

// Execute the CLI with the given arguments

program.parse(process.argv);