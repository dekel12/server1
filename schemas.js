var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/comparely');
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
	category_path: String,
    isDisplayed: Boolean,
    extraField1: String,
    extraField2: String,
    extraField3: String,
    extraField4: String,
    wasUpdated: Boolean
});

var categorySchema = new Schema({
	url: String,
    path: String,
    name: String,
    products: [productSchema],
    wasUpdated: Boolean
});


exports.Product = mongoose.model('Product', productSchema);
exports.Category = mongoose.model('Category', categorySchema);