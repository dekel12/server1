var express = require('express');
var schemas = require('./schemas.js');
var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var router = express();
var bodyParser = require('body-parser');

router.use(bodyParser.json()); // for parsing application/json
router.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded


// this will cache the categories so the DB should be less loaded. also, this prevents outdated data due to asynchronous calls.
var cachedCategories = {};

function copyObject(from, to) {
    for (var i in from) {
        to[i] = from[i];
    }
}

function log(a) {
    console.log(a);
    return a;
}

function updateCategories(callback) {
    fs.readFile('./categories', function (err, data) {
        if (err) {
            // if no file was found, no need to panic, just return.
            return;
        }
        // for each line, json.parse it.
        var categoriesArray = _.map(data.toString().split('\n'), function (categoryString) {
            try {
                return JSON.parse(categoryString)
            }
            catch (err) {
                return undefined;
            }
        });
        // for each category
        for (var i = 0; i < categoriesArray.length; i++) {
            if (categoriesArray[i]) (function (i) {
                // find a category by its url.
                schemas.Category.findOne({url: categoriesArray[i].url}, function (err, categoryDoc) {
                    if (err) {
                        return log(err);
                    }
                    // if one hasn't been found
                    if (!categoryDoc) {
                        // create a new one and save it
                        var newCategory = new schemas.Category(categoriesArray[i]);
                        return newCategory.save(function (err) {
                            callback();
                            return log(err);
                        });
                    }
                    // This category already exists. update it in the DB
                    copyObject(categoriesArray[i], categoryDoc);
                    categoryDoc.lastUpdate = Date.now();
                    categoryDoc.save(function (err) {
                        callback();
                        return log(err);
                    });
                });
            })(i);
        }
    });
}

function updateProductInCategory(categoryDoc, product, id){
    // search this product in the "products" array in a category. update if found, else push it to the array.
    //optional param: id. if id is defined, search products array for a product by id.
    var productFoundInCategory = false;
    product.lastUpdate = Date.now();
    for (var j = 0; j < categoryDoc.products.length  && !productFoundInCategory; j++) {
        if(!id) {
            if (categoryDoc.products[j].url === product.url) {
                copyObject(product, categoryDoc.products[j]);
                productFoundInCategory = true;
            }
        }
        else{
            // we put "==" instead of "===" because categoryDoc.products[j]._id's type is "ObjectId" while typeof id is String.
            if (log(log(categoryDoc.products[j]._id) == log(id))) {
                copyObject(product, categoryDoc.products[j]);
                productFoundInCategory = true;
            }
        }
    }
    if (!productFoundInCategory){
        categoryDoc.products.push(product);
    }
    cachedCategories[product.category] = categoryDoc;
}

function updateProducts(callback) {
    cachedCategories = {};
    fs.readFile('./products', function (err, data) {
        if(err){
            return log(err);
        }
        // json.parse the lines in the file
        var productsArray = _.map(data.toString().split('\n'), function (productString) {
            try {
                return JSON.parse(productString)
            }
            catch (err) {
                return undefined;
            }
        });
        // create an array of functions, that each of them search the category of a specific product in the chache/DB.
        var searchDBforProductsFunctions = _.map(productsArray,function(product){
            if (!product)
                return function(callback){callback()};
            return function (callback){
                if (!cachedCategories[product.category]) {
                    schemas.Category.findOne({name: product.category}, function (err, categoryDoc) {
                        if (err) {
                            return log(err);
                        }
                        if (!categoryDoc) {
                            //throw Error('No category was found to contain ' + product);
                            return callback();
                        }
                        updateProductInCategory(categoryDoc, product);
                        return callback();
                    });
                }
                else {
                    updateProductInCategory(cachedCategories[product.category], product);
                    return callback();
                }
            };
        });
        // execute those functions in parallel, and in the end save them all from the cache.
        async.parallel(searchDBforProductsFunctions, function(err, results){
            _.each(cachedCategories, function(categoryDoc){
                categoryDoc.save(function(err){
                    callback();
                    return log(err);
                });
            });
        });
    });
}

router.get('/products', function(req, res, next){
    schemas.Category.find({}, function(err, categories){
        if (err) {
            res.status(400);
            return res.send(err);
        }
        var resultProducts = [];
        _.each(categories, function(category){
            _.each(category.products, function(product){
                resultProducts.push(product);
            });
        });
        res.send(resultProducts);
    });
});

router.get('/categories', function(req, res){
    schemas.Category.find({}, function(err, categories){
        if (err) {
            res.status(400);
            return res.send(err);
        }
        res.send(categories);
    });
});

router.put('/category/:id', function(req, res, next) {
    console.log(req.body);
    log(typeof req.body);
    schemas.Category.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) {
            res.status(400);
            return res.send(err);
        }
        res.json(post);
    });
});

router.put('/product/:id', function(req, res, next) {
    schemas.Category.findOne({"products._id": req.params.id}, function(err, categoryOfTheProduct){
        updateProductInCategory(categoryOfTheProduct, req.body, req.params.id);
        categoryOfTheProduct.save(function(err){
            if (err) {
                res.status(400);
                return res.send(err);
            }
            res.send('OK');
        });
    });
});

router.get('/update', function(req, res){
    //update categories and then update products
    updateCategories(function(){
        updateProducts(function(){
            res.send('OK');
        });
    });
});

router.get('/shutdown', function(req, res){
    //shutdown server
    process.exit(0);
});

//updateCategories();
//updateProducts();
var server = router.listen(8080, function () {

    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);

});

