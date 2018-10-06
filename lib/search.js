'use strict'

// AWS DynamoDB libraries and config
const AWS = require('aws-sdk')
const ddb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' })

// Function for querying the DB
async function searchQuery(coordinates, config, callback) {
	let params = { TableName: config.table }
	if (config.type) {
		params.FilterExpression = 'contains(#types, :type)'
		params.ExpressionAttributeNames = { '#types': 'type' }
		params.ExpressionAttributeValues = { ':type': config.type }
	}

	ddb.scan(params, (err, data) => {
		if (err) {
			console.error(err)
		} else {
			let result = getResult(coordinates, data.Items)
			return callback(result)
		}
	})
}

// Function for calculating distances http://jonisalonen.com/2014/computing-distance-between-coordinates-can-be-simple-and-fast/
function calcDistance(coordinates, result) {
	result = result.coords
	return 110.25 * Math.sqrt(Math.pow(result[1] - coordinates[0], 2) + Math.pow((result[0] - coordinates[1]) * Math.cos(coordinates[0] * (Math.PI/180)), 2))
}

function getResult(coordinates, results) { // Gets the results array and returns the nearest
	if (results.length === 0) {
		return null
	}
	// Search for the nearest result
	let nearest = 0
	let distance = calcDistance(coordinates, results[nearest])

	for (let i = 1; i < results.length; i++) {
		let newDistance = calcDistance(coordinates, results[i])

		if (newDistance < distance) { // If the new calculated distance is less than the actual nearest distance, replace it
			nearest = i
			distance = newDistance
		}
	}
	results[nearest].distance = Math.round(distance * 100000) / 100 // Round distance to meters
	return results[nearest]
}

exports.searchQuery = searchQuery
