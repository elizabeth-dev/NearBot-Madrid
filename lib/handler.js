'use strict'

// Telegram and Botgram libraries and config
const https = require('https')
const agent = new https.Agent({ keepAlive: true, maxFreeSockets: 5 }) // Creating keepAlive agent
const botgram = require('botgram')
const bot = botgram(process.env.TELEGRAM_TOKEN, { agent: agent }) // Initializing Botgram with keepAlive agent

const searchQuery = require('./search').searchQuery
const processResult = require('./render').processResult

const regex = { // Strings for sending and comparing messages to regex
	metro: { text: 'Vamos a buscar estaciones de metro. ', table: 'NearBot_Madrid_Transport', type: 'metro', filterDB: true },
	cercanias: { text: 'Vamos a buscar estaciones de cercanías. ', table: 'NearBot_Madrid_Transport', type: 'commuter', filterDB: true },
	metroligero: { text: 'Vamos a buscar estaciones de metro ligero. ', table: 'NearBot_Madrid_Transport', type: 'tram', filterDB: true },
	transporte: { text: 'Vamos a buscar estaciones de cualquier medio de transporte. ', table: 'NearBot_Madrid_Transport', type: 'transport', filterDB: false },
	fuente: { text: 'Vamos a buscar fuentes de agua. ', table: 'NearBot_Madrid_Fountain', type: 'fountain', filterDB: false },
	bici: { text: 'Vamos a buscar bases de BiciMAD. ', table: 'NearBot_Madrid_Bike', type: 'bike', filterDB: false },
	aseo: { text: 'Vamos a buscar el aseo más cercano. ', table: 'NearBot_Madrid_WC', type: 'wc', filterDB: false },
	carrefour: { text: 'Vamos a buscar el supermercado Carrefour más cercano. ', table: 'NearBot_Madrid_Supermarket', type: 'carrefour', filterDB: true },
	mercadona: { text: 'Vamos a buscar el supermercado Mercadona más cercano. ', table: 'NearBot_Madrid_Supermarket', type: 'mercadona', filterDB: true },
	supermercado: { text: 'Vamos a buscar el supermercado más cercano. ', table: 'NearBot_Madrid_Supermarket', type: 'supermarket', filterDB: false },
}

function doTheSearch(type, reply, coordinates) {
	let config = regex[type]
	searchQuery(coordinates, config, (result) => {
		processResult(config.type, coordinates, reply, result)
	})
}

// Show bot usage guide
bot.command('start', 'help', (msg, reply) => {
	reply.markdown('¡Hola! Soy NearBot. Puedes pedirme que busque sitios (como por ejemplo, supermercados) en Madrid y te responderé con la información y la localización del que tengas más cerca.\n\nPara ello, puedes enviarme tu ubicación y seleccionar el sitio que desees buscar en el menú que aparecerá.\n\n*Comandos*\n/help - Vuelve a mostrar este mensaje\n/comandos - Muestra una lista de comandos disponibles para buscar\n/info - Muestra información del bot\n/novedades - Muestra los cambios añadidos recientemente al bot')
})

bot.command('comandos', (msg, reply) => {
	reply.markdown('*Medios de transporte*\n/transporte - Busca una estación de cualquier medio de transporte (no incluye bici)\n/metro - Busca una estación de metro\n/cercanias - Busca una estación de cercanías\n/metroligero - Busca una estación de metro ligero\n/bici - Busca una estación de BiciMAD\n\n*Supermercados*\n/supermercado - Busca un supermercado de cualquier marca\n/carrefour - Busca un supermercado Carrefour\n/mercadona - Busca un supermercado Mercadona\n\n*Otros*\n/fuente - Busca una fuente de agua potable en Madrid\n/aseo - Busca un aseo público en Madrid')
})

// Show bot license and info
bot.command('info', (msg, reply) => {
	reply.disablePreview().markdown('*NearBot Madrid*\nVersión ' + process.env.NEARBOT_VERSION + '\n\nTiempo de ejecución Node.js v8.10 junto al framework para bots [Botgram](https://github.com/botgram/botgram) v2.2.0.\n\nEste bot es software libre y está licenciado bajo [GNU AGPL v3.0](https://github.com/elizabeth-dev/NearBot-Madrid/blob/master/LICENSE.md), lo cuál significa que puedes modificarlo y redistribuirlo libremente conforme a los términos de la licencia. Asimismo, se distribuye sin ninguna garantía ni responsabilidad.\n\nPuedes obtener más informacion sobre el funcionamiento del bot, su código fuente, y su licencia en su repositorio de GitHub [NearBot-Madrid](https://github.com/elizabeth-dev/NearBot-Madrid).\n\nAdemás, puedes contactar con su creadora por [Twitter](https://twitter.com/Eli_coptero_), o por [Telegram](tg://user?id=74460537).\n\n_Elizabeth Martín Campos_\nhttps://eli.zabeth.es/')
})

// Show what's new in the last update
bot.command('novedades', (msg, reply) => {
	reply.markdown('Esta es la primera versión publicada de NearBot Madrid.\n\nAún no hay ninguna novedad, pero dentro de poco se publicará la versión 2.0, la cuál añadirá mejoras en cuanto a los horarios de los resultados, la integración con la API pública de BiciMAD, o el rendimiento general del bot, entre otras.\n\nVuelve pronto para comprobar si ya se ha publicado la actualización.')
})

// Privacy policy and licenses
bot.command('privacidad', (msg, reply) => {
	reply.markdown('*Términos de privacidad*\nCon el fin de poder mejorar el funcionamiento de NearBot, se almacenan ciertos datos de cada consulta que realizas. En concreto, por cada petición se almacenan datos como el _tipo de consulta_, la _fecha_, la _ubicación_ desde donde se lleva a cabo, el _resultado_ obtenido, e _identificadores internos_ de Telegram de los mensajes que le envías al bot. Cabe destacar que estos datos son *completamente anónimos*, ya que nunca se relacionan con tu nombre, teléfono, usuario de Telegram, ni ningún otro dato personal. Además, NearBot lleva a cabo una cuenta del número de peticiones llevadas a cabo por cada usuario.\n\n*Licencias de uso*\nNearBot funciona gracias a las bases de datos públicas de las siguientes entidades:\n\nEMT Madrid\nhttp://www.emtmadrid.es/\n\nCRTM\nhttp://www.crtm.es/\n\nAyuntamiento de Madrid\nhttp://www.madrid.es/')
})

// Place request
bot.command('metro', 'cercanias', 'metroligero', 'transporte', 'fuente', 'bici', 'aseo', 'carrefour', 'mercadona', 'supermercado', (msg, reply) => {
	reply.keyboard([[{ text: '📌 Enviar mi ubicación', request: 'location' }]], true).text(regex[msg.command].text + 'Toca en el botón inferior para enviar tu ubicación.')
})

bot.location((msg, reply) => {
	let coordinates = [msg.latitude, msg.longitude]
	if (msg.reply) { // If the location is a reply to a message (serverless tricks)
		const commands = Object.keys(regex)
		for (let i = 0; i < commands.length; i++) {
			const { text } = regex[commands[i]]
			if (msg.reply.text.startsWith(text)) {
				doTheSearch(commands[i], reply, coordinates)
				break
			}
		}
	} else { // If the user sends their location and wants to pick a place
		reply.inlineKeyboard([
			[{ text: 'Transporte', callback_data: JSON.stringify({ t: 'tte_menu', c: coordinates }) }],
			[{ text: 'Supermercado', callback_data: JSON.stringify({ t: 'spr_menu', c: coordinates }) }],
			[{ text: 'BiciMAD', callback_data: JSON.stringify({ t: 'bici', c: coordinates }) }],
			[{ text: 'Fuente de agua', callback_data: JSON.stringify({ t: 'fuente', c: coordinates }) }],
			[{ text: 'Aseo', callback_data: JSON.stringify({ t: 'aseo', c: coordinates }) }]
		]).text('De acuerdo, ahora, dime qué quieres que busque.')
	}
})

bot.callback((query, next) => {
	try {
		var data = JSON.parse(query.data)
	} catch (err) {
		console.log(err)
		return next()
	}

	let reply = bot.reply(query.message.chat.id)

	switch (data.t) {
	case 'menu':
		reply.inlineKeyboard([
			[{ text: 'Transporte', callback_data: JSON.stringify({ t: 'tte_menu', c: data.c }) }],
			[{ text: 'Supermercado', callback_data: JSON.stringify({ t: 'spr_menu', c: data.c }) }],
			[{ text: 'BiciMAD', callback_data: JSON.stringify({ t: 'bici', c: data.c }) }],
			[{ text: 'Fuente de agua', callback_data: JSON.stringify({ t: 'fuente', c: data.c }) }],
			[{ text: 'Aseo', callback_data: JSON.stringify({ t: 'aseo', c: data.c }) }]
		]).editReplyMarkup(query.message).then(query.answer())
		break
	case 'tte_menu':
		reply.inlineKeyboard([
			[{ text: 'Metro', callback_data: JSON.stringify({ t: 'metro', c: data.c }) }],
			[{ text: 'Cercanías', callback_data: JSON.stringify({ t: 'cercanias', c: data.c }) }],
			[{ text: 'Metro ligero', callback_data: JSON.stringify({ t: 'metroligero', c: data.c }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'transporte', c: data.c }) }],
			[{ text: '<- Volver', callback_data: JSON.stringify({ t: 'menu', c: data.c }) }]
		]).editReplyMarkup(query.message).then(query.answer())
		break
	case 'spr_menu':
		reply.inlineKeyboard([
			[{ text: 'Carrefour', callback_data: JSON.stringify({ t: 'carrefour', c: data.c }) }],
			[{ text: 'Mercadona', callback_data: JSON.stringify({ t: 'mercadona', c: data.c }) }],
			[{ text: 'Cualquiera', callback_data: JSON.stringify({ t: 'supermercado', c: data.c }) }],
			[{ text: '<- Volver', callback_data: JSON.stringify({ t: 'menu', c: data.c }) }]
		]).editReplyMarkup(query.message).then(query.answer())
		break
	default:
		doTheSearch(data.t, reply, data.c)
		query.answer()
		break
	}
})

bot.stop()

module.exports.telegram = (event, context, callback) => {
	bot.processUpdate(JSON.parse(event.body)) // Botgram processes incoming request
	const response = {
		statusCode: 200,
		body: JSON.stringify('NearBot v' + process.env.NEARBOT_VERSION)
	}

	callback(null, response)
}
