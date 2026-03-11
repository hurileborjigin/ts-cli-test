#!/usr/bin/env node

import {Command} from "commander";

// Declare the program
const program = new Command();


// Add actions to that CLI
program
    .argument("<Name>", "Name of the person to greet")
    .action((name: string) => {
        console.log(`Hello, ${name}!`);
    })
    .description("A simple CLI to greet people by their name")
    .version("0.0.1")
// Execute the CLI with the given arguments

program.parse(process.argv);