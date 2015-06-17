/**
 * Created by Tal on 16/06/2015.
 */
var express = require('express');
var schemas = require('./schemas.js');
var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var async = require('async');
var router = express();
var bodyParser = require('body-parser');

var prodPath = '../amazon_bestsellers_top10_product/'+getMostRecentFileName('../amazon_bestsellers_top10_product');
var catPath = '../amazon_bestsellers_categories/'+getMostRecentFileName('../amazon_bestsellers_categories');

// Return only base file name without dir
function getMostRecentFileName(dir) {
    var files = fs.readdirSync(dir);

    // use underscore for max()
    return _.max(files, function (f) {
        var fullpath = path.join(dir, f);

        // ctime = creation time is used
        // replace with mtime for modification time
        return fs.statSync(fullpath).ctime;
    });
}

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
    log('started scan categories');
    fs.readFile(catPath, function (err, data) {
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
                log('error: cannot parse:' + categoryString + ' \n cause: ' + err);
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
                        log('cannot find category:' + category.url);
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
        if (categoryDoc.products[j]._id == id) {
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
    fs.readFile(prodPath, function (err, data) {
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

updateCategories(function(){
    updateProducts(function(){
        fs.rename(prodPath,'./old/products'+Date.now(),function(err){
            fs.rename(catPath,'./old/categories'+Date.now(),function(err){
                console.log('finished job');
            });
        });
    });
});
