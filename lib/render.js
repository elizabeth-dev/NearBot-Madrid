'use strict'

const https = require('https')
const crypto = require('crypto') // Crypto module for signing Maps requests

const imgSize = '400x500' // Size for the map image

const mapsKey = process.env.MAPS_TOKEN // Google Maps Static API Key
const mapsSigning = process.env.MAPS_SIGNING_SECRET // Google Maps API signing secret
const emtID = process.env.EMT_ID_CLIENT
const emtPass = process.env.EMT_PASS_KEY

exports.processTransport = processTransport
exports.processFuente = processFuente
exports.processBici = processBici
exports.processAseo = processAseo
exports.processSuper = processSuper

// I still need this https://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript/196991#196991
function toTitleCase(str) {
	return str.replace(/\w\S*/g, function(txt){
		return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
	})
}

// Transform hour in format 900 in format 9:00
function transformHour(hora) {
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
		[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + coordinates }]
	]
}

async function processTransport(mode, coordinates, reply, result) { // Process transport requests
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ninguna estación de ' + mode + ' cercana.')
	} else {
		var denominacionPrincipal, lineasPrincipal, modos
		switch(mode) { // Set the principal station mode
		case 'metro':
			denominacionPrincipal = result.metroName
			lineasPrincipal = '\nLíneas Metro: _' + result.metroLines.sort().toString().replace(/,/g, '_, _') + '_'
			modos = '🚇'
			break
		case 'cercanías':
			denominacionPrincipal = result.commuterName
			lineasPrincipal = '\nLíneas Cercanías: _' + result.commuterLines.sort().toString().replace(/,/g, '_, _') + '_'
			modos = '🚆'
			break
		case 'metro ligero':
			denominacionPrincipal = result.tramName
			lineasPrincipal = '\nLíneas Metro ligero: _' + result.tramLines.sort().toString().replace(/,/g, '_, _') + '_'
			modos = '🚊'
			break
		case 'transporte':
			if (result.metroName) {
				denominacionPrincipal = result.metroName
				lineasPrincipal = '\nLíneas Metro: _' + result.metroLines.sort().toString().replace(/,/g, '_, _') + '_'
				modos = '🚇'
				mode = 'metro'
			} else if (result.commuterName) {
				denominacionPrincipal = result.commuterName
				lineasPrincipal = '\nLíneas Cercanías: _' + result.commuterLines.sort().toString().replace(/,/g, '_, _') + '_'
				modos = '🚆'
				mode = 'cercanías'
			} else {
				denominacionPrincipal = result.tramName
				lineasPrincipal = '\nLíneas Metro ligero: _' + result.tramLines.sort().toString().replace(/,/g, '_, _') + '_'
				modos = '🚊'
				mode = 'metro ligero'
			}
			break
		}

		let denominacionSecundaria = ''
		let lineasSecundaria = ''

		// Set the secondary station modes
		if (result.metroName && mode !== 'metro') {
			if (result.metroName !== denominacionPrincipal) {
				denominacionSecundaria = '\n🚇 Metro: ' + result.metroName
			} else {
				modos = modos + '🚇'
			}
			lineasSecundaria = '\nLíneas Metro: _' + result.metroLines.sort().toString().replace(/,/g, '_, _') + '_'
		}
		if (result.commuterName && mode !== 'cercanías') {
			if (result.commuterName !== denominacionPrincipal) {
				denominacionSecundaria = denominacionSecundaria + '\n🚆 Cercanías: ' + result.commuterName
			} else {
				modos = modos + '🚆'
			}
			lineasSecundaria = lineasSecundaria + '\nLíneas Cercanías: _' + result.commuterLines.sort().toString().replace(/,/g, '_, _') + '_'
		}
		if (result.tramName && mode !== 'metro ligero') {
			if (result.tramName !== denominacionPrincipal) {
				denominacionSecundaria = denominacionSecundaria + '\n🚊 Metro ligero: ' + result.tramName
			} else {
				modos = modos + '🚊'
			}
			lineasSecundaria = lineasSecundaria + '\nLíneas Metro ligero: _' + result.tramLines.sort().toString().replace(/,/g, '_, _') + '_'
		}

		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = result.coords[1] + ',' + result.coords[0]

		reply.keyboard().text('Esta es la estación de ' + mode + ' más cercana:')
		reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), modos + ' *' + denominacionPrincipal + '* (_' + result.distance + 'm_)' + denominacionSecundaria + '\n' + lineasPrincipal + lineasSecundaria, 'Markdown')
	}
}

async function processFuente(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna fuente cercana.')
	} else {
		let street = ''
		if (result.street) { // If theres no street value, skip it
			street = result.street
		}

		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = result.coords[1] + ',' + result.coords[0]

		reply.keyboard().text('La fuente más cercana es:')
		reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), '🚰 *' + toTitleCase(result.name) + '* (_' + result.distance + 'm_)\n\n' + toTitleCase(street), 'Markdown')
	}
}

async function processBici(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna estación de BiciMAD.')
	} else {
		// Indentation in VSCode is broken, so i have to put inverted bars to make it work
		https.get('https://rbdata.emtmadrid.es:8443/BiciMad/get_single_station/' + emtID + '/' + emtPass + '/' + result.id, (res) => {
			let body = ''

			res.on('data', (chunk) => {
				body += chunk
			})

			res.on('end', () => {
				body = JSON.parse(JSON.parse(body).data).stations[0]
				let biciDisponible = body.dock_bikes + '/' + (body.free_bases + body.dock_bikes)

				if (body.light === 0) {
					biciDisponible += ' (baja ocupación)'
				} else if (body.light === 1) {
					biciDisponible += ' (alta ocupación)'
				}

				// Hide the custom keyboard, and return the result with a map
				let resultCoordinates = result.coords[1] + ',' + result.coords[0]

				reply.keyboard().text('La estación de BiciMAD más cercana es:')
				reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), '🚲 ' + result.baseId + ' - *' + result.name + '* (_' + result.distance + 'm_)\nBicis: ' + biciDisponible + '\n\n' + result.street, 'Markdown')
			})
		})
	}
}

async function processAseo(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ningún aseo cercano.')
	} else {
		let descripcion = ''
		if (result.description) { // If there is no descripcion value, skip it
			descripcion = result.description
		}

		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = result.coords[1] + ',' + result.coords[0]

		reply.keyboard().text('El aseo más cercano es:')
		reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), '🚽 *' + result.street + '* (_' + result.distance + 'm_)\n\n' + descripcion, 'Markdown')
	}
}

async function processSuper(marca, coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ningún ' + marca + ' cercano.')
	} else {
		// Get the opening hours for the current day
		let day = new Date().getDay()
		let arrayHorarios = result.timetable[day]
		let horario = ''
		if (arrayHorarios[0][0] === 0) {
			horario = ' Cerrado hoy'
		} else {
			for (let i = 0; i < arrayHorarios[0].length; i++) {
				horario = (horario + ' ' + transformHour(arrayHorarios[0][i].toString()) + 'h - ' + transformHour(arrayHorarios[1][i].toString()) + 'h ').replace('  ', ', ')
			}
		}

		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = result.coords[1] + ',' + result.coords[0]

		reply.keyboard().text('El ' + marca + ' más cercano es:')
		reply.inlineKeyboard(replyKeyboard(resultCoordinates)).photo(getMap(coordinates, resultCoordinates), '🛒 *' + result.name + '* (_' + result.distance + 'm_)\n\n' + result.street + ', ' + result.city + '\n\n📞 ' + result.phone + '\n🕒' + horario, 'Markdown')
	}
}
