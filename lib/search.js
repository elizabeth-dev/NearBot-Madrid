'use strict'

// AWS DynamoDB libraries and config
const AWS = require('aws-sdk')
const ddbGeo = require('dynamodb-geo')
const ddb = new AWS.DynamoDB({ region: 'eu-west-1' })

// Function for querying the DB
async function searchQuery(coordinates, config, callback) {
	let configDB = new ddbGeo.GeoDataManagerConfiguration(ddb, config.table)
	configDB.hashKeyLength = config.hashLength
	let searchDB = new ddbGeo.GeoDataManager(configDB)
	
	// Increment the radius until results are found
	for (let radius = config.radius, foundResult = false; radius <= config.radiusLimit && foundResult === false; radius = radius*2) {
		await searchDB.queryRadius(Object.assign({
			RadiusInMeter: radius,
			CenterPoint: {
				latitude: coordinates[0],
				longitude: coordinates[1]
			}
		}, config.filter))
		.then((results) => {
			// When done, or the radius limit is reached, return the resulted array
			if (results.length > 0 || radius === config.radiusLimit) {
				foundResult = true
				return callback(getResult(coordinates, results))
			}
		})
	}
}

// Function for calculating distances http://jonisalonen.com/2014/computing-distance-between-coordinates-can-be-simple-and-fast/
function calcDistance(coordinates, result) {
	let geoJson = JSON.parse(result.geoJson.S)
	return 110.25 * Math.sqrt(Math.pow(geoJson.coordinates[1] - coordinates[0], 2) + Math.pow((geoJson.coordinates[0] - coordinates[1]) * Math.cos(coordinates[0] * (Math.PI/180)), 2))
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
