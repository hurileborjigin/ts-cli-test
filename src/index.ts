#!/usr/bin/env node

import {Command} from "commander";
import * as readline from "readline";

// Declare the program
const program = new Command();


// Add actions to that CLI
program
    // variadic argument collects all remaining words in an array
    .argument("<name...>", "Name of the person to greet (first, last, …)")
    .option("-c --capitalize", "Capitalize the name")
    .action((names: string[]) => {
        // join the pieces back into a single string
        let fullName = names.join(" ");

        if (program.opts().capitalize) {
            // capitalise each word, not just the first character of the whole string
            fullName = fullName
                .split(" ")
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
        }

        console.log(`Hello, ${fullName}!`);
    })
    .description("A simple CLI to greet people by their name")
    .version("0.0.1");
// Execute the CLI with the given arguments


program.command("ask <question>")
    .description("Ask a question")
    .action((question: string) => {
        console.log(`You asked: ${question}`);
    });


program.command("ask-age")
    .description("Ask the user's age")
    .action(async () => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question("What is your age? ", (age: string) => {
            const parsedAge = parseInt(age.trim(), 10);
            if (isNaN(parsedAge)) {
                console.log("Invalid age provided. Please enter a number.");
            } else {
                console.log(`You are ${parsedAge} years old.`);
            }
            rl.close();
        });
    });
program.parse(process.argv);

function prompt(arg0: string): string {
    throw new Error("Function not implemented.");
}
