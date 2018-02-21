const axios = require('axios');
const moment = require('moment');
const fs = require('fs');

// get input path from terminal
const path = process.argv[2];
const input_path = "./" + path;

// API url
const url_cash_in = "http://private-38e18c-uzduotis.apiary-mock.com/config/cash-in";
const url_cash_out_n = "http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/natural";
const url_cash_out_j = "http://private-38e18c-uzduotis.apiary-mock.com/config/cash-out/juridical";
const url_rates = "http://private-38e18c-uzduotis.apiary-mock.com/rates";

let cash_in ;
let cash_out_n ;
let cash_out_j ;
let rates ;

const promises = [
    axios.get(url_cash_in),
    axios.get(url_cash_out_n),
    axios.get(url_cash_out_j),
    axios.get(url_rates),
    fs.readFileSync(input_path, 'utf8', (err, data)=>data )
];

Promise.all(promises).then(([cash_in_data, cash_out_n_data, cash_out_j_data, rates_data, input])=> {

    input = JSON.parse(input);

    cash_in = cash_in_data.data;
    cash_out_n = cash_out_n_data.data;
    cash_out_j = cash_out_j_data.data;
    rates = rates_data.data;

    input.forEach((trans) => {
        calculate(trans);
    })
});

// identify the type of transaction and initiate relevant tax calculation function
function calculate(trans) {
    let tax;
    if (trans.type === "cash_in") {
        tax = cashInTax(trans);
    }
    if (trans.type === "cash_out") {
        if (trans.user_type === "natural") {
            tax = cashOutNatTax(trans);
        } else if (trans.user_type === "juridical") {
            tax = cashOutJurTax(trans);
        }
    }
    console.log(tax.toFixed(2))
}

// calculating tax for different transactions
function cashInTax(trans) {
    let percents = cash_in.percents / 100;
    let max = cash_in.max.amount;
    let currency = trans.operation.currency;

    let trans_amount = trans.operation.amount;
    let converted_amount = convert(trans_amount,currency,"forward");
    let tax = converted_amount * percents;

    if (tax > max) {
        tax = max;
    }

    let converted_tax = convert(tax,currency,"backward");
    tax = Math.ceil(converted_tax * 100) / 100;
    return tax;
}
function cashOutJurTax(trans) {
    let percents = cash_out_j.percents / 100;
    let min = cash_out_j.min.amount;
    let currency = trans.operation.currency;

    let trans_amount = trans.operation.amount;
    let converted_amount = convert(trans_amount,currency,"forward");
    let tax = converted_amount * percents;

    if (tax < min) {
        tax = min;
    }

    let converted_tax = convert(tax,currency,"backward");
    tax = Math.ceil(converted_tax * 100) / 100;
    return tax;
}
function cashOutNatTax(trans) {
    let percents = cash_out_n.percents / 100;
    let week_limit = cash_out_n.week_limit.amount;
    let currency = trans.operation.currency;

    let trans_amount = trans.operation.amount;
    let converted_amount = convert(trans_amount,currency,"forward");

    // find local history of transactions for this user, or get null if doesnt exist
    let limit_hist = findObjectByKey(local_trans_hist, 'user_id', trans.user_id);

    // translate the transaction date to a format of weeks and years.
    let trans_date = moment(trans.date, "YYYY-MM-DD").format("W,YYYY");

    let limit;
    let tax;

    // if transaction history for user doesnt exist, calculate new limit after transaction and push an object to array
    if (limit_hist === null) {

        limit = week_limit - converted_amount;

        if (limit >= 0) {
            tax = 0;
        }
        else if (limit < 0) {
            tax = ( -limit) * percents;
        }

        local_trans_hist.push({user_id: trans.user_id, date: trans_date, limit: limit});

        //else check if new transaction is in same or new week and if limit has been reached or no, calculate tax accordingly, update local limit history
    } else {
        if (limit_hist.date === trans_date) {
            if (limit_hist.limit > 0) {

                limit = limit_hist.limit - trans_amount;
                if (limit >= 0) {
                    tax = 0;
                }
                else if (limit < 0) {
                    tax = (-limit) * percents;
                }
            }
            else if (limit_hist.limit < 0) {
                limit = limit_hist.limit - trans_amount;
                tax = trans_amount * percents;

            }
        } else if (limit_hist.date !== trans_date) {
            limit = week_limit - converted_amount;

            if (limit > 0) {
                tax = 0;
            }
            else if (limit <= 0) {
                tax = ( -limit) * percents;
            }
        }

        let new_limit_hist = {user_id: trans.user_id, date: trans_date, limit: limit};
        chandeObjectByKey(local_trans_hist, 'user_id', trans.user_id, new_limit_hist);
    }

    let converted_tax = convert(tax,currency,"backward");
    tax = Math.ceil(converted_tax * 100) / 100;
    return tax;

}


// local history of transaction limits in each week, updated after every transaction.
let local_trans_hist = [
    {user_id: '', date: '', limit: ''}
];
// Utility functions for using and updating local history array objects
function findObjectByKey(array, key, value) {
    for (let i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            return array[i];
        }
    }
    return null;
}
function chandeObjectByKey(array, key, value, new_obj) {
    for (let i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            array[i].date = new_obj.date;
            array[i].limit = new_obj.limit;
        }
    }
}

// function for converting money in both directions
function convert (amount,currency,direction) {
    let rate;
    if (currency === "USD") {
        rate = rates.EUR.USD;
    } else if (currency === "JPY") {
        rate = rates.EUR.JPY;
    } else if (currency === "EUR") {
        rate = 1;
    }
    if(direction==="forward"){
        return amount / rate;
    }
    else if(direction==="backward"){
        return amount * rate;
    }
}






