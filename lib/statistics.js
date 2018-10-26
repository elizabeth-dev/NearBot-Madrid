'use strict'

const DynamoDB = require('aws-sdk/clients/dynamodb')
const ddb = new DynamoDB.DocumentClient({ region: 'eu-west-1' })
let requestParams = { TableName: 'NearBot_Madrid_Request' }
let userParams = {
	TableName: 'NearBot_Madrid_User',
	UpdateExpression: 'ADD requests :a',
	ExpressionAttributeValues: { ':a': 1 }
}

function postMessage(err, res, stats) {
	if (err) {
		//console.error(err)
	}
	stats.duration.receivedRes = new Date().getTime() - stats.date
	stats.cpuUsage = process.cpuUsage(stats.cpuUsage)
	stats.responseId = res.id
	stats.version = process.env.NEARBOT_VERSION

	requestParams.Item = stats
	ddb.put(requestParams, (err) => {
		if (err) {
			console.error(err)
		}
	})

	userParams.Key = { chatId: res.chat.id }
	ddb.update(userParams, (err) => {
		if (err) {
			console.error(err)
		}
	})
}

exports.postMessage = postMessage
