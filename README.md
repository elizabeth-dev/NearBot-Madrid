# NearBot Madrid
Find near places in Madrid simply with NearBot, a bot that lets you to ask for any popular place, like supermarkets, subway stations, or drinking fountains, and through your location, it will search and tell you the position and some information of the nearest one. NearBot Madrid currently supports the following places:
* Subway, commuter rail, and tram stations
* Supermarkets of different brands
* BiciMAD stations (public bike renting)
* Drinking fountains
* Public bathrooms

In the future, we will add some new categories, like ATMs, public Wi-Fi acces points, vegan food restaurants, and many other that would be handy to find quickly.

## Built and ran with
* __Node.js v8.10__ - Runtime
* __AWS Lambda__ - Serverless platform
* __AWS API Gateway__ - API Endpoint
* __AWS DynamoDB__ - Database engine

### Used data
* [CRTM Open Data](http://www.crtm.es/)
* [Madrid City Council](http://www.madrid.es)
* [EMT Madrid](http://www.emtmadrid.es/)
* [Google Maps API](https://cloud.google.com/maps-platform/)

## Dependencies
* [aws-sdk](https://www.npmjs.com/package/aws-sdk) - For connecting to DynamoDB databases.
* [dynamodb-geo](https://www.npmjs.com/package/dynamodb-geo) - For making geospatial queries.
* [botgram](https://www.npmjs.com/package/botgram) - Telegram bot framework.

## Authors
* __Elizabeth Martín Campos__ - _Creator and initial work_ - [Webpage](https://eli.zabeth.es/)

## License
This project is licensed under the AGPLv3 license, a free software license that lets you to modify and distribute NearBot, including commercial use, but always under the same or a similar license. See the [LICENSE.md](LICENSE.md) for more details. Some of the APIs used in NearBot may be licensed under different licenses.

## Contributing
Feel free to submit any issue, pull request, ask for enhancements, or any other change request you wish to make, but always providing a detailed explanation of the changes made, new improvements, added or removed dependencies, or any other important information that can affect the deployment or the future development of NearBot. Any request will be inspected and evaluated by the mantainers (only by me atm, hehe), and may be rejected if it's considered unnecessary or against the aims of the project.
