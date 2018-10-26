const AWS =  require('aws-sdk');
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

const BATCH_SIZE = 25; // DynamoDB batch operations item limit
const BATCH_WAIT = 1000;

var region = 'eu-west-1'; // Default region
var tableName = null;
var fileName = null;
var file = null;
var attributes = [];
var hashKey = null;
var hashKeyType = 'S';
var rangeKey = null;
var rangeKeyType = 'S';

// Default aprovisioned capacity units
var readUnits = 3;
var writeUnits = 3;

// Prompt the user for selecting the desired Region
const regionPrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the AWS region [eu-west-1]: ', (ans) => {
			// If no region selected, leave the default region
			if (ans !== '') {
				region = ans;
			}

			console.log('Region ' + region + ' selected.');
			console.log('')
			resolve();
		});
	});
}

// Prompt the user for selecting the name of the new table
const tablePrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the table name: ', (ans) => {
			tableName = ans;
			resolve();
		});
	});
}

// Prompt the user for selecting the number of aprovisioned RCU and WCU
const readPrompt = () => {
	return new Promise((resolve) => {
		rl.question('Introduce the number of aprovisioned read capacity units [3]: ', (ans) => {
			// If no number given, use the default
			if (ans !== '') {
				readUnits = parseInt(ans);
			}
			resolve();
		});
	});
}

const writePrompt = () => {
	return new Promise((resolve) => {
		rl.question('Introduce the number of aprovisioned write capacity units [3]: ', (ans) => {
			if (ans !== '') {
				writeUnits = parseInt(ans);
			}
			resolve();
		});
	});
}

// Get the JSON file from where the table content will be loaded
const filePrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the JSON file to upload: ', (ans) => {
			fileName = ans;

			file = JSON.parse(fs.readFileSync(fileName, 'utf8'));

			// Read the file and get the number of entries
			console.log('Detected ' + file.length + ' entries.');
			console.log('');
			resolve();
		});
	});
}

// Select the partition key (and the sort key if required)
const hashPrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the partition key: ', (ans) => {
			hashKey = ans;

			resolve();
		});
	});
}

const hashTypePrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the partition key type (S/n/b): ', (ans) => {
			hashKeyType = ans;

			resolve();
		});
	});
}

const rangePrompt = () => {
	return new Promise((resolve) => {
		rl.question('Select the sort key (empty for none): ', (ans) => {
			// If sort key is not required, leave it null
			if (ans !== '') {
				rangeKey = ans;
			}
			resolve();
		});
	});
}

const rangeTypePrompt = () => {
	return new Promise((resolve) => {
		if (rangeKey) {
			rl.question('Select the sort key type (S/n/b): ', (ans) => {
				rangeKeyType = ans;

				console.log('');
				resolve();
			});
		} else {
			console.log('');
			resolve();
		}
	});
}

// Confirm th operation
const confirmPrompt = () => {
	return new Promise((resolve) => {
		rl.question('Region: ' + region + '\nTable name: ' + tableName + '\nFile: ' + fileName + '\n    Read capacity units: ' + readUnits + '\n    Write capacity units: ' + writeUnits + '\nEntries: ' + file.length + '\n    Partition key: ' + hashKey + '\n    Sort key: ' + rangeKey + '\n\nProceed? (y/N): ', (ans) => {
			if (ans === 'y' || ans === 'Y') {
				resolve();
			} else {
				console.log('Aborted.')
				rl.close();
			}
		});
	});
}

const main = async() => {
	// Call a promise for every question made to the user (readline limitations for doing multiple questions)
	await regionPrompt();
	await tablePrompt();
	await readPrompt();
	await writePrompt();
	await filePrompt();
	await hashPrompt();
	await hashTypePrompt();
	await rangePrompt();
	await rangeTypePrompt();
	await confirmPrompt();

	// Configure the AWS region and create the DynamoDB clients
	AWS.config.update({ region: region });

	const ddb = new AWS.DynamoDB();
	const ddbClient = new AWS.DynamoDB.DocumentClient();

	// Table creation request schema
	let tableParams = {
		AttributeDefinitions: [
			{
				AttributeName: hashKey,
				AttributeType: hashKeyType
			}
		],
		KeySchema: [
			{
				AttributeName: hashKey,
				KeyType: 'HASH'
			}
		],
		ProvisionedThroughput: {
			ReadCapacityUnits: readUnits,
			WriteCapacityUnits: writeUnits
		},
		TableName: tableName
	};

	// If the user requested a sort key, add it to the request
	if (rangeKey) {
		tableParams.AttributeDefinitions.push({
			AttributeName: rangeKey,
			AttributeType: rangeKeyType
		});

		tableParams.KeySchema.push({
			AttributeName: rangeKey,
			KeyType: 'RANGE'
		});
	}

	// Send the new table request
	ddb.createTable(tableParams).promise()
	.then(() => {
		// Wait until the table has been created
		console.log('');
		console.log('Creating table...');
		return ddb.waitFor('tableExists', { TableName: tableName }).promise()
	})
	.then(() => {
		console.log('');
		console.log('Loading data from ' + fileName);

		// Load all the entries in a valid request format
		const entries = file.map((element) => {
			return {
				PutRequest: {
					Item: element
				}
			}
		});

		var batchCount = 1;
		function resumeWrite() {
			// If no entries left for upload, finish the process
			if (entries.length === 0) {
				console.log('Finished!')
				return Promise.resolve();
			}

			const currentBatch = [];

			// Due to DynamoDB limitation, every batch operation is limited to 25 items
			for (let i = 0, item = null; i < BATCH_SIZE && (item = entries.shift()); i++) {
				currentBatch.push(item);
			}

			console.log('Writing batch ' + (batchCount++) + '/' + Math.ceil(file.length / BATCH_SIZE));

			// Load the current set of entries into the request
			var params = {
				RequestItems: {

				}
			};
			params['RequestItems'][tableName] = currentBatch;

			// Send the request
			return ddbClient.batchWrite(params, (err) => {
				if (err) {
					console.error(err);
				}
			}).promise()
			.then(() => {
				// When finished, wait a second for sending the new request
				return new Promise((resolve) => {
					setInterval(resolve, BATCH_WAIT);
				});
			})
			.then(() => {
				// Reload the function
				return resumeWrite();
			});
		}

		return resumeWrite().catch((err) => {
			console.error(err);
		});
	});

	rl.close();
}

main();
