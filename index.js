var express = require('express');
var schemas = require('./schemas.js');
var fs = require('fs');
var _ = require('underscore');
var async = require('async');

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
    fs.readFile('./amztop100cat', function (err, data) {
        if (err) {
            throw err;
        }
        var categoriesArray = _.map(data.toString().split('\n'), function (categoryString) {
            try {
                return JSON.parse(categoryString)
            }
            catch (err) {
                return undefined;
            }
        });
        for (var i = 0; i < categoriesArray.length; i++) {
            if (categoriesArray[i]) (function (i) {
                schemas.Category.findOne({url: categoriesArray[i].url}, function (err, categoryDoc) {
                    if (err) {
                        throw err;
                    }
                    if (!categoryDoc) {
                        var newCategory = new schemas.Category(categoriesArray[i]);
                        return newCategory.save(function (err) {
                            if (err) throw err;
                        });
                    }
                    // This category already exists. update it in the DB
                    copyObject(categoriesArray[i], categoryDoc);
                    categoryDoc.save(function (err) {
                        if (err) throw err;
                    });
                });
            })(i);
        }
    });
}

function updateProductInCategory(categoryDoc, product){
    var productFoundInCategory = false;
    for (var j = 0; j < categoryDoc.products.length  && !productFoundInCategory; j++) {
        if (categoryDoc.products[j].url === product.url) {
            categoryDoc.products[j] = product;
            productFoundInCategory = true;
        }
    }
    if (!productFoundInCategory){
        categoryDoc.products.push(product);
    }
    cachedCategories[product.category] = categoryDoc;
}

function updateProducts(callback) {
    cachedCategories = {};
    fs.readFile('./amztop100prod', function (err, data) {
        var productsArray = _.map(data.toString().split('\n'), function (productString) {
            try {
                return JSON.parse(productString)
            }
            catch (err) {
                return undefined;
            }
        });
        var searchDBforProductsFunctions = _.map(productsArray,function(product){
            if (!product)
                return function(callback){callback()};
            return function (callback){
                if (!cachedCategories[product.category]) {
                    schemas.Category.findOne({name: product.category}, function (err, categoryDoc) {
                        if (err) {
                            throw err;
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
        async.parallel(searchDBforProductsFunctions, function(err, results){
            _.each(cachedCategories, function(categoryDoc){
                categoryDoc.save(function(err){
                    if (err) throw err;
                });
            });
        });
    });
}
