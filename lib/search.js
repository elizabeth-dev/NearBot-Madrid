'use strict'

// AWS DynamoDB libraries and config
const DynamoDB = require('aws-sdk/clients/dynamodb')
const ddb = new DynamoDB.DocumentClient({ region: 'eu-west-1' })
const timezone = process.env.TIMEZONE

function filterTimetable(results) {
	let filteredResults = []
	let currentDate = new Date(Date.now() + timezone * 36e5)
	let currentTime = currentDate.getUTCHours().toString() + currentDate.getUTCMinutes().toString()
	for (var i = 0; i < results.length; i++) {
		let todayTimetable = results[i].timetable[currentDate.getUTCDay()]
		let yestTimetable = results[i].timetable[(currentDate.getUTCDay() + 6) % 7]
		for (var c = 0; c < todayTimetable[0].length; c++) {
			if (currentTime > todayTimetable[0][c] && currentTime < todayTimetable[1][c]) {
				filteredResults.push(results[i])
			}
		}
		for (var a = 0; a < yestTimetable[0].length; a++) {
			if (currentTime + 2400 > yestTimetable[0][a] && currentTime + 2400 < yestTimetable[1][a]) {
				filteredResults.push(results[i])
			}
		}
	}
	return filteredResults
}

// Function for calculating distances http://jonisalonen.com/2014/computing-distance-between-coordinates-can-be-simple-and-fast/
function calcDistance(coordinates, result) {
	result = result.coords
	return 110.25 * Math.sqrt(Math.pow(result[0] - coordinates[0], 2) + Math.pow((result[1] - coordinates[1]) * Math.cos(coordinates[0] * (Math.PI/180)), 2))
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

// Function for querying the DB
async function searchQuery(coordinates, config) {
	let params = {
		TableName: config.table,
		FilterExpression: '#enabled = :enabled',
		ExpressionAttributeNames: { '#enabled': 'enabled' },
		ExpressionAttributeValues: { ':enabled': true }
	}
	if (config.filterDB) {
		params.FilterExpression += ' AND contains(#types, :type)'
		params.ExpressionAttributeNames['#types'] = 'type'
		params.ExpressionAttributeValues[':type'] = config.type
	}

	let data = await ddb.scan(params).promise().catch((err) => {
		console.error(err)
	})

	let results = data.Items
	if (results[0].timetable) {
		results = filterTimetable(results)
	}

	let result = getResult(coordinates, results)
	return result
}

exports.searchQuery = searchQuery
