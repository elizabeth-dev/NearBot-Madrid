'use strict'

const DynamoDB = require('aws-sdk/clients/dynamodb')
const ddb = new DynamoDB.DocumentClient({ region: 'eu-west-1' })
let params = {
	TableName: 'NearBot_Madrid_Error',
	Item: {
		date: new Date().getTime()
	}
}

function reportError(type, messageId) {
	params.Item.messageId = messageId
	params.Item.type = type

	ddb.put(params, (err) => {
		if (err) {
			console.error(err)
		}
	})
}

exports.reportError = reportError
