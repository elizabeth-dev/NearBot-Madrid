'use strict'

const https = require('https')
const crypto = require('crypto') // Crypto module for signing Maps requests
const converter = require('aws-sdk').DynamoDB.Converter.output

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
		return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	});
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

async function processTransport(mode, coordinates, reply, result) { // Process transport requests
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ninguna estación de ' + mode + ' cercana.')
	} else {
		switch(mode) { // Set the principal station mode
			case 'metro':
			var denominacionPrincipal = result.denominacionMetro.S
			var lineasPrincipal = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
			var modos = '🚇'
			break
			case 'cercanías':
			var denominacionPrincipal = result.denominacionCercanias.S
			var lineasPrincipal = '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
			var modos = '🚆'
			break
			case 'metro ligero':
			var denominacionPrincipal = result.denominacionLigero.S
			var lineasPrincipal = '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
			var modos = '🚊'
			break
			case 'transporte':
			if (result.denominacionMetro) {
				var denominacionPrincipal = result.denominacionMetro.S
				var lineasPrincipal = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
				var modos = '🚇'
				mode = 'metro'
			} else if (result.denominacionCercanias) {
				var denominacionPrincipal = result.denominacionCercanias.S
				var lineasPrincipal = '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
				var modos = '🚆'
				mode = 'cercanías'
			} else {
				var denominacionPrincipal = result.denominacionLigero.S
				var lineasPrincipal = '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
				var modos = '🚊'
				mode = 'metro ligero'
			}
			break
		}
		
		let denominacionSecundaria = ''
		let lineasSecundaria = ''
		
		// Set the secondary station modes
		if (result.denominacionMetro && mode !== 'metro') {
			if (result.denominacionMetro.S !== denominacionPrincipal) {
				denominacionSecundaria = '\n🚇 Metro: ' + result.denominacionMetro.S
			} else {
				modos = modos + '🚇'
			}
			lineasSecundaria = '\nLíneas Metro: _' + converter(result.lineasMetro).sort().toString().replace(/,/g, '_, _') + '_'
		}
		if (result.denominacionCercanias && mode !== 'cercanías') {
			if (result.denominacionCercanias.S !== denominacionPrincipal) {
				denominacionSecundaria = denominacionSecundaria + '\n🚆 Cercanías: ' + result.denominacionCercanias.S
			} else {
				modos = modos + '🚆'
			}
			lineasSecundaria = lineasSecundaria + '\nLíneas Cercanías: _' + converter(result.lineasCercanias).sort().toString().replace(/,/g, '_, _') + '_'
		}
		if (result.denominacionLigero && mode !== 'metro ligero') {
			if (result.denominacionLigero.S !== denominacionPrincipal) {
				denominacionSecundaria = denominacionSecundaria + '\n🚊 Metro ligero: ' + result.denominacionLigero.S
			} else {
				modos = modos + '🚊'
			}
			lineasSecundaria = lineasSecundaria + '\nLíneas Metro ligero: _' + converter(result.lineasLigero).sort().toString().replace(/,/g, '_, _') + '_'
		}
		
		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
		
		reply.keyboard().text('Esta es la estación de ' + mode + ' más cercana:')
		reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo(getMap(coordinates, resultCoordinates), modos + ' *' + denominacionPrincipal + '* (_' + result.distance + 'm_)' + denominacionSecundaria + '\n' + lineasPrincipal + lineasSecundaria, 'Markdown')
	}
}

async function processFuente(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna fuente cercana.')
	} else {
		let calle = ''
		if (result.calle) { // If theres no street value, skip it
			calle = result.calle.S
		}
		
		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
		
		reply.keyboard().text('La fuente más cercana es:')
		reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo(getMap(coordinates, resultCoordinates), '🚰 *' + toTitleCase(result.denominacion.S) + '* (_' + result.distance + 'm_)\n\n' + toTitleCase(calle), 'Markdown')
	}
}

async function processBici(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ninguna estación de BiciMAD.')
	} else {
		// Indentation in VSCode is broken, so i have to put inverted bars to make it work
		https.get('https:\/\/rbdata.emtmadrid.es:8443/BiciMad/get_single_station/' + emtID + '/' + emtPass + '/' + result.rangeKey.S, (res) => {
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
				let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
				
				reply.keyboard().text('La estación de BiciMAD más cercana es:')
				reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo(getMap(coordinates, resultCoordinates), '🚲 ' + result.numeroBase.S + ' - *' + result.denominacionBici.S + '* (_' + result.distance + 'm_)\nBicis: ' + biciDisponible + '\n\n' + result.calle.S, 'Markdown')
			})
		})
	}
}

async function processAseo(coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de Madrid. No hemos logrado encontrar ningún aseo cercano.')
	} else {
		let descripcion = ''
		if (result.descripcion) { // If there is no descripcion value, skip it
			descripcion = result.descripcion.S
		}
		
		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
		
		reply.keyboard().text('El aseo más cercano es:')
		reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo(getMap(coordinates, resultCoordinates), '🚽 *' + result.calle.S + '* (_' + result.distance + 'm_)\n\n' + descripcion, 'Markdown')
	}
}

async function processSuper(marca, coordinates, reply, result) {
	if (!result) { // If no results found
		reply.keyboard().text('Parece que estás bastante lejos de la ciudad. No hemos logrado encontrar ningún ' + marca + ' cercano.')
	} else {
		// Get the opening hours for the current day
		let day = new Date().getDay()
		let arrayHorarios = converter(result.horario.L[day])
		let horario = ''
		if (arrayHorarios[0][0] === 0) {
			horario = ' Cerrado hoy'
		} else {
			for (let i = 0; i < arrayHorarios[0].length; i++) {
				horario = (horario + ' ' + transformHour(arrayHorarios[0][i].toString()) + 'h - ' + transformHour(arrayHorarios[1][i].toString()) + 'h ').replace('  ', ', ')
			}
		}
		
		let descripcion = ''
		if (result.descripcion) { // If there is not descripcion value, skip it
			descripcion = '\n' + result.descripcion.S
		}
		
		// Hide the custom keyboard, and return the result with a map
		let resultCoordinates = JSON.parse(result.geoJson.S).coordinates[1] + ',' + JSON.parse(result.geoJson.S).coordinates[0]
		
		reply.keyboard().text('El ' + marca + ' más cercano es:')
		reply.inlineKeyboard([[{ text: 'Abrir en app', url: 'https://www.google.com/maps/search/?api=1&query=' + resultCoordinates }]]).photo(getMap(coordinates, resultCoordinates), '🛒 *' + result.nombre.S + '* (_' + result.distance + 'm_)\n\n' + result.calle.S + ', ' + result.ciudad.S + descripcion + '\n\n📞 ' + result.telefono.S + '\n🕒' + horario, 'Markdown')
	}
}
