function( doc ) {

  var time    = new Date(doc.close_time_timestamp),
    unix      = Math.round(time.getTime()),
    timestamp = [time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate(),
      time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds()
    ];

  doc.transactions.forEach(function(tx) {

    if (tx.metaData.TransactionResult !== 'tesSUCCESS') {
      return;
    }

    if (tx.TransactionType !== 'TrustSet') {
      return;
    }

    tx.metaData.AffectedNodes.forEach(function(affNode) {
      
      var node = affNode.ModifiedNode || affNode.CreatedNode;
      
      if (!node || node.LedgerEntryType !== 'RippleState') {
        return;
      }
      
      var fields   = node.NewFields || node.FinalFields,
        low        = fields.LowLimit,
        high       = fields.HighLimit,
        lowValue   = parseFloat(low.value, 10), 
        highValue  = parseFloat(high.value, 10);
      
      if (lowValue && tx.Account==low.issuer) {      
        emit([high.issuer].concat(timestamp).concat([tx.hash]), [low.issuer,  low.currency, lowValue,   unix]);
        emit([low.issuer].concat(timestamp).concat([tx.hash]),  [high.issuer, low.currency, 0-lowValue, unix]);
      }
      
      if (highValue && tx.Account==high.issuer) {        
        emit([high.issuer].concat(timestamp).concat([tx.hash]), [low.issuer,  low.currency, 0-highValue, unix]);
        emit([low.issuer].concat(timestamp).concat([tx.hash]),  [high.issuer, low.currency, highValue,   unix]);
      }         
    });
  });
}