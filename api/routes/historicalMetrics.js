var winston = require('winston'),
  moment    = require('moment'),
  _         = require('lodash'),
  tools     = require('../utils');
  
/**
 *
 
   curl -o tradeVolume-2014 -H "Content-Type: application/json" -X POST -d '{
      "startTime" : "Jan 1, 2014 10:00 am",
      "endTime"   : "Jan 1, 2015 10:00 am",
      "exchange"  : {"currency":"USD","issuer":"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      "metric"    : "totalValueSent",
      "interval"  : "days"
      
    }' http://localhost:5993/api/historicalMetrics
 
 */
function historicalMetrics(params, callback) {

  var ex = params.exchange || {currency:"XRP"};
  
  if (typeof ex != 'object')               return callback('invalid exchange currency');
  else if (!ex.currency)                   return callback('exchange currency is required');
  else if (typeof ex.currency != 'string') return callback('invalid exchange currency');
  else if (ex.currency.toUpperCase() != "XRP" && !ex.issuer)
    return callback('exchange issuer is required');
  else if (ex.currency == "XRP" && ex.issuer)
    return callback('XRP cannot have an issuer');
      
  var startTime = tools.getAlignedTime(params.startTime, params.interval, 1);
  var time      = moment.utc(startTime);
  var endTime   = moment.utc(params.endTime);
  var interval  = params.interval;
  var keyBase, keys = [];
  var metrics = {
    totalValueSent : 'TVS',
    totalNetworkValue : 'TNV',
    topMarkets : 'TM'
  };
  
  if (!metrics[params.metric]) {
    return callback('invalid metric');
  } else {
    keyBase = metrics[params.metric];
  }
  
  while(endTime.diff(time)>0) {
    var cacheKey = keyBase + ':XRP:hist:';
    cacheKey += time.unix();
    
    time.add(interval, 1);
    if (keyBase != 'TNV') cacheKey += ':' + time.unix();
    keys.push(cacheKey);
  }
  
  var results = [];
  //get cached points for the range
  redis.mget(keys, function(err, resp) {
    resp.forEach(function(row) {
      if (row) {
        results.push(JSON.parse(row));
      }
    });
    
    if (ex.currency !== 'XRP') {
      var params = {
        currency  : ex.currency,
        issuer    : ex.issuer,
        startTime : startTime.subtract(interval, 1),
        endTime   : tools.getAlignedTime(endTime, interval, 1).add(interval, 1),
        increment : interval
      }
      
      getConversion(params, function(err, resp) {
        results.forEach(function(row, index){
          row.exchange     = ex;
          row.exchangeRate = resp[row.startTime] || 0;
          row.total       *= row.exchangeRate;
          row.components.forEach(function(c, i) {
            c.convertedAmount *= row.exchangeRate;
          });
        });
        handleResults(results);   
      });
    } else {
      handleResults(results);
    }
  });
  
  function handleResults (rows) {
    var csv = "", ex = "";
    rows.forEach(function(row, index) {
      if (!index) {
          csv += "time, currency, rate, total, count, ";
          row.components.forEach(function(c) {
            var label = c.currency || c.base.currency;
            if (c.issuer) {
              label += '.' + tools.getGatewayName(c.issuer); 
            } else if (c.base && c.base.issuer) {
              label += '.' + tools.getGatewayName(c.base.issuer);
            }
            
            if (c.counter) {
              label += '/' + c.counter.currency;
              if (c.counter.issuer) label += '.' + tools.getGatewayName(c.counter.issuer);
            }
            
            csv += label + ":rate, " + label + ":amount, " + label + ":count, ";
          });
          
          csv += "\n ";
        ex = row.exchange.currency;
        if (row.exchange.issuer) ex += '.' + tools.getGatewayName(row.exchange.issuer);
      }
      
      csv += row.startTime + ', ' + 
        ex + ', ' +
        row.exchangeRate  + ', ' +
        row.total + ', ' +
        row.count + ', ';
        
      row.components.forEach(function(c) {  
        csv += c.rate + ', ' + 
        c.convertedAmount + ', ' +
        c.count + ', ';
      });
      
      csv += '\n ';
    });
    
    callback(null, csv);
  }
  
  /**
   * get XRP to specified currency conversion
   */
  function getConversion (params, callback) {
    
    // Mimic calling offersExercised 
    require("./offersExercised")({
        base      : {currency:"XRP"},
        counter   : {currency:params.currency,issuer:params.issuer},
        startTime : params.startTime,
        endTime   : params.endTime,
        timeIncrement : params.increment,
        format : 'json'
      
    }, function(err, data) {
        var results = {};
        data.results.forEach(function(row){
          results[row.startTime] = row.vwap;
        });
        
        callback (null, results);
    });    
  }
}


module.exports = historicalMetrics;