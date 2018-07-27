// Script to upload listaTransportes.json
// https://github.com/rh389/dynamodb-geo.js/blob/master/example/index.js

const AWS = require('aws-sdk')
const ddb = new AWS.DynamoDB({ region: 'eu-west-1' })

const ddbGeo = require('dynamodb-geo')

const config = new ddbGeo.GeoDataManagerConfiguration(ddb, 'NearBot_Madrid_Transporte')
config.hashKeyLength = 8
const gtManager = new ddbGeo.GeoDataManager(config)

// Configure DynamoDB table
const createTable = ddbGeo.GeoTableUtil.getCreateTableRequest(config)
createTable.ProvisionedThroughput.ReadCapacityUnits = 15
createTable.ProvisionedThroughput.WriteCapacityUnits = 15

console.log('Table with schema:')
console.dir(createTable, { depth: null })

// Create the table
ddb.createTable(createTable).promise()
	// Check if it's ready
	.then(function () { return ddb.waitFor('tableExists', { TableName: config.tableName }).promise() })
	// Load data
	.then(function () {
		console.log('Loading from listaTransporte.json')
		const data = require('./databases/listaTransporte.json')
		const putPointsInputs = data.map(function (estacion) {
			return {
				RangeKeyValue: { S: estacion.CODIGOINTERCAMBIADOR.toString() },
				GeoPoint: {
					latitude: estacion.LAT,
					longitude: estacion.LON
				},
				PutItemInput: {
					Item: {
						denominacionMetro: AWS.DynamoDB.Converter.input(estacion.DENOMINACIONMETRO),
						denominacionCercanias: AWS.DynamoDB.Converter.input(estacion.DENOMINACIONCERCANIAS),
						denominacionLigero: AWS.DynamoDB.Converter.input(estacion.DENOMINACIONLIGERO),
						lineas: AWS.DynamoDB.Converter.input(estacion.LINEAS),
						modos: AWS.DynamoDB.Converter.input(estacion.MODOS)
					}
				}
			}
		})

		const BATCH_SIZE = 25
		const WAIT_BETWEEN_BATCHES_MS = 1000
		var currentBatch = 1

		function resumeWriting() {
			if (putPointsInputs.length === 0) {
				return Promise.resolve()
			}

			const thisBatch = []
			for (var i = 0, itemToAdd = null; i < BATCH_SIZE && (itemToAdd = putPointsInputs.shift()); i++) {
				thisBatch.push(itemToAdd)
			}
				
			console.log('Writing batch ' + (currentBatch++) + '/' + Math.ceil(data.length / BATCH_SIZE))
			console.log(thisBatch)
			return gtManager.batchWritePoints(thisBatch).promise()
				.then(function () {
					return new Promise(function (resolve) {
						setInterval(resolve, WAIT_BETWEEN_BATCHES_MS)
					})
				})
				.then(function () {
					return resumeWriting()
				})
		}

		return resumeWriting().catch(function (error) {
			console.warn(error)
		})
	})
