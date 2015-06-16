var express = require('express');
var schemas = require('./schemas.js');
var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var router = express();
var bodyParser = require('body-parser');

router.use(bodyParser.json()); // for parsing application/json
router.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
}

router.use(allowCrossDomain);
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

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
}

router.use(allowCrossDomain);

function updateCategories(callback) {
    fs.readFile('./categories', function (err, data) {
        if (err) {
            // if no file was found, no need to panic, just return.
            log(err);
            return callback();
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
        var categoriesUploadFunctions = _.map(categoriesArray, function(category){
            if (!category)
                return function(callback){callback()};
            return function(callback){
                // find a category by its url.
                schemas.Category.findOne({url: category.url}, function (err, categoryDoc) {
                    if (err) {
                        log(err);
                        return callback();
                    }
                    // if one hasn't been found
                    if (!categoryDoc) {
                        // create a new one and save it
                        var newCategory = new schemas.Category(category);
                        return newCategory.save(function (err) {
                            if (err)
                                log(err);
                            callback();
                        });
                    }
                    // This category already exists. update it in the DB
                    copyObject(category, categoryDoc);
                    categoryDoc.lastUpdate = Date.now();
                    categoryDoc.save(function (err) {
                        if (err)
                            log(err);
                        callback();
                    });
                });
            };
        });
        async.parallel(categoriesUploadFunctions, function(err, results){
            if (err)
                log(err);
            callback();
        });
    });
}


function findProductInCat(categoryDoc, prodID) {
    for (var j = 0; j < categoryDoc.products.length; j++) {
        if (categoryDoc.products[j]._id == prodID) {
            return categoryDoc.products[j];
        }
    }
    return {};
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
            if (categoryDoc.products[j]._id == id) {
                copyObject(product, categoryDoc.products[j]);
                productFoundInCategory = true;
            }
        }
    }
    if (!productFoundInCategory){
        categoryDoc.products.push(product);
    }
    cachedCategories[product.category_path] = categoryDoc;
}

function updateProducts(callback) {
    cachedCategories = {};
    fs.readFile('./products', function (err, data) {
        if(err){
            log(err);
            return callback();
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
                if (!cachedCategories[product.category_path]) {
                    schemas.Category.findOne({path: product.category_path}, function (err, categoryDoc) {
                        if (err) {
                            callback();
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
                    updateProductInCategory(cachedCategories[product.category_path], product);
                    return callback();
                }
            };
        });
        // execute those functions in parallel, and in the end save them all from the cache.
        async.parallel(searchDBforProductsFunctions, function(err, results){
            _.each(cachedCategories, function(categoryDoc){
                categoryDoc.save(function(err){
                    if (err)
                        log(err);
                });
            });
            callback();
        });
    });
}

// API
// get all products
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

// get all categories
router.get('/categories', function(req, res){
    schemas.Category.find({},'url path name lastUpdate', function(err, categories){
        if (err) {
            res.status(400);
            return res.send(err);
        }
        res.send(categories);
    });
});

// update category by id
router.post('/category/:id', function(req, res, next) {
   /* schemas.Category.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) {
            res.status(400);
            return res.send(err);
        }
        post.save(function(err, p){
            if (err) {
                res.status(400);
                return res.send(err);
            }
            console.log(req);
            res.send(p);
        });
    });*/
   /* schemas.Category.findOne({"products._id": req.params.id}, function(err, categoryOfTheProduct){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!categoryOfTheProduct){
            res.status(400);
            return res.send('Error: No category was found to contain that product');
        }
        updateProductInCategory(categoryOfTheProduct, req.body, req.params.id);
        categoryOfTheProduct.save(function(err){
            if (err) {
                res.status(400);
                return res.send(err);
            }
            res.send('OK');
        });
    });*/

    schemas.Category.update({"_id": req.params.id}, req.body , function(err, model) {
        if (err) {
            res.status(400);
            return res.send(err);
        }
        res.send(model);
    });
});

router.put('/category/:id', function(req, res, next) {
    schemas.Category.findByIdAndUpdate(req.params.id, req.body, function (err, post) {
        if (err) {
            res.status(400);
            return res.send(err);
        }
        res.json(post);
    });
});

// get category by path
router.post('/category', function(req, res, next) {
    schemas.Category.find({path: req.body.path}, function (err, categoryDoc) {
        if (err || !categoryDoc) {
            res.status(400);
            return res.send(err);
        }
        res.jsonp(categoryDoc);
    });
});

router.put('/product/:id', function(req, res, next) {
    schemas.Category.findOne({"products._id": req.params.id}, function(err, categoryOfTheProduct){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!categoryOfTheProduct){
            res.status(400);
            return res.send('Error: No category was found to contain that product');
        }
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

router.post('/product/:id', function(req, res, next) {
    schemas.Category.findOne({"products._id": req.params.id}, function(err, categoryOfTheProduct){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!categoryOfTheProduct){
            res.status(400);
            return res.send('Error: No category was found to contain that product');
        }
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

router.get('/product/:id', function(req, res, next) {
    schemas.Category.findOne({"products._id": req.params.id}, function(err, categoryOfTheProduct){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!categoryOfTheProduct){
            res.status(400);
            return res.send('Error: No category was found to contain that product');
        }
        return res.send(findProductInCat(categoryOfTheProduct, req.params.id));
    });
});

router.get('/category/:id', function(req, res, next) {
    schemas.Category.findOne({"_id": req.params.id}, function(err, category){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!category){
            res.status(400);
            return res.send('Error: No category was found');
        }
        return res.send(category);
    });
});

router.put('/productbyurl/:url', function(req, res, next) {
    schemas.Category.findOne({"products.url": req.params.url}, function(err, categoryOfTheProduct){
        if (err){
            res.status(400);
            return res.send(err);
        }
        if (!categoryOfTheProduct){
            res.status(400);
            return res.send('Error: No category was found to contain that product');
        }
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
            fs.rename('./products','./old/products'+Date.now(),function(err){
                fs.rename('./categories','./old/categories'+Date.now(),function(err){
                    res.send('OK');
                });
            });
        });
    });
});


var server = router.listen(3000, function () {

    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);

});
