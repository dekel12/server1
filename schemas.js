var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var productSchema = new Schema({
	category: String,
	available: String,
	average_customer_review: String,
	name: String,
	first_available: String,
	url: String,
	asin: String,
	brand: String,
	item_model_number: String,
	reviews: [String],
	rating_change: String,
	video: String,
	current_price: String,
	count_customer_reviews: String,
	previous_price: String,
	image: [String],
	category_path: String

});



exports.Product = mongoose.model('Product', productSchema);