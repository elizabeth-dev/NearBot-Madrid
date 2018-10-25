'use strict'

const https = require('https')
const crypto = require('crypto') // Crypto module for signing Maps requests

const imgSize = '400x500' // Size for the map image

const mapsKey = process.env.MAPS_TOKEN // Google Maps Static API Key
const mapsSigning = process.env.MAPS_SIGNING_SECRET // Google Maps API signing secret
const emtID = process.env.EMT_ID_CLIENT
const emtPass = process.env.EMT_PASS_KEY

const typeEmoji = {
	metro: '🚇',
	commuter: '🚆',
	tram: '🚊',
	fountain: '🚰',
	bike: '🚲',
	wc: '🚽',
	carrefour: '🛒',
	mercadona: '🛒'
}

// Transform hour in format 900 in format 9:00
function transformHour(hora) {
	hora = hora.padStart(4, '0')
	return hora.slice(0, hora.length-2) + ':' + hora.slice(hora.length-2, hora.length)
}

// Generate signed Maps Static API requests
function getMap(coordinates, resultCoordinates) {
	let mapsRequest = '/maps/api/staticmap?size=' + imgSize + '&markers=color:blue%7Csize:mid%7C' + coordinates[0] + ',' + coordinates[1] + '&markers=color:red%7C' + resultCoordinates + '&language=es&key=' + mapsKey
	let signature = crypto.createHmac('sha1', Buffer.from(mapsSigning.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).update(mapsRequest).digest('base64').replace(/\+/g, '-').replace(/\//g, '_')
	return 'https://maps.googleapis.com' + mapsRequest + '&signature=' + signature
}

function replyKeyboard(coordinates) {
	return [
		[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + coordinates }],
		[{ text: 'Resultado incorrecto', callback_data: JSON.stringify({ e: 'error', c: coordinates }) }]
	]
}

async function getBikeStatus(id) {
	return new Promise((resolve) => {
		https.get('https://rbdata.emtmadrid.es:8443/BiciMad/get_single_station/' + emtID + '/' + emtPass + '/' + id, (res) => {
			let body = ''

			res.on('data', (chunk) => {
				body += chunk
			})

			res.on('end', () => {
				body = JSON.parse(JSON.parse(body).data).stations[0]
				let bikeStatus = 'Bicis: ' + body.dock_bikes + '/' + (body.free_bases + body.dock_bikes)

				if (body.light === 0) {
					bikeStatus += ' (baja ocupación)'
				} else if (body.light === 1) {
					bikeStatus += ' (alta ocupación)'
				}
				bikeStatus += '\n'

				resolve(bikeStatus)
			})
		})
	})
}

async function processResult(type, coordinates, reply, result, stats) {
	return new Promise (async (resolve) => {
		if (type === 'transport' || type === 'supermarket') { // For convenience
			type = result.type[0]
		}

		let bikeStatus = ''
		if (type === 'bike') { // Start loading BiciMAD status
			bikeStatus = getBikeStatus(result.id)
		}

		let emoji = ''
		for (var i = 0; i < result.type.length; i++) {
			emoji += typeEmoji[result.type[i]]
		}
		let name = ' *' + result.name[type] + '* '
		let distance = '(_' + result.distance + 'm_)\n'

		let metroName = ''
		let commuterName = ''
		let tramName = ''
		if(result.name.metro && result.name.metro !== result.name[type]) {
			metroName = 'Metro: ' + result.name.metro + '\n'
		}
		if(result.name.commuter && result.name.commuter !== result.name[type]) {
			commuterName = 'Cercanías: ' + result.name.commuter + '\n'
		}
		if(result.name.tram && result.name.tram !== result.name[type]) {
			tramName = 'Metro Ligero: ' + result.name.tram + '\n'
		}

		let street = ''
		let phone = ''
		let timetable = ''
		if (result.street) {
			street = result.street + '\n\n'
		}
		if (result.phone) {
			phone = '📞 ' + result.phone + '\n'
		}
		if (result.timetable) {
			let day = new Date().getDay()
			let timetableArray = result.timetable[day]
			if (timetableArray[0][0] === 0 && timetableArray[1][0] === 0) {
				timetable = '🕒 Cerrado hoy\n'
			} else {
				for (let i = 0; i < timetableArray[0].length; i++) {
					timetable = ('🕒 ' + transformHour(timetableArray[0][i].toString()) + 'h - ' + transformHour(timetableArray[1][i].toString()) + 'h ').replace('  ', ', ') + '\n'
				}
			}
		}

		let metroLines = ''
		let commuterLines = ''
		let tramLines = ''
		if (result.lines) {
			if (result.lines.metro) {
				metroLines = 'Líneas Metro: _' + result.lines.metro.sort().toString().replace(/,/g, '_, _') + '_\n'
			}
			if (result.lines.commuter) {
				commuterLines = 'Líneas Cercanías: _' + result.lines.commuter.sort().toString().replace(/,/g, '_, _') + '_\n'
			}
			if (result.lines.tram) {
				tramLines = 'Líneas Metro Ligero: _' + result.lines.tram.sort().toString().replace(/,/g, '_, _') + '_\n'
			}
		}

		let resultCoordinates = result.coords.toString()
		reply.keyboard().text('Aquí tienes: ')
		stats.duration.sentRes = new Date().getTime() - stats.date
		reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), emoji + name + distance + metroName + commuterName + tramName + await bikeStatus + '\n' + street + phone + timetable + metroLines + commuterLines + tramLines, 'Markdown').then((err, res) => {
			resolve([err, res, stats])
		})
		stats.result = result.id
		stats.distance = result.distance
	})
}

exports.processResult = processResult
