define([
  'angular',
  'underscore',
  'jquery',
  'config',
  'kbn',
  'moment'
],
function (angular, _, $, config, kbn, moment) {
  'use strict';

  var module = angular.module('kibana.services');

  module.factory('KairosDBDatasource', function(dashboard, $q, filterSrv, $http) {

    function KairosDBDatasource(datasource) {
      this.type = 'kairosdb';
      this.basicAuth = datasource.basicAuth;
      this.url = datasource.url;
      this.username = datasource.username;
      this.password = datasource.password;
      this.editorSrc = 'app/partials/kairosdb/editor.html';
      this.name = datasource.name;

      this.templateSettings = {
        interpolate : /\[\[([\s\S]+?)\]\]/g,
      };
    }

    KairosDBDatasource.prototype.query = function(options) {

      console.log("query: options", options);
      var payload = {};

      this.translateTime(options.range.from, payload, "start");
      this.translateTime(options.range.to, payload, "end");

      console.log("Payload", payload);

/*        var graphOptions = {
          from: this.translateTime(options.range.from),
          until: this.translateTime(options.range.to),
          targets: options.targets,
          format: options.format,
          maxDataPoints: options.maxDataPoints,
        };
*/

      var delta = this.deltaTime(options.range.from, options.range.to);
      console.log("Delta (ms)", delta);
      var value = delta / options.maxDataPoints;
      console.log("Value (ms)", value);

      payload.metrics = _.chain(options.targets)
                          .reject(function(target) {
                            return (!target.series /*|| !target.column*/ || target.hide);
                          })
                          .map(function(target) {
                            var obj = {};
                            obj.name = target.series;
                            obj.tags = {};
                            obj.aggregators = [{name: "avg", sampling:{value: value, unit: "milliseconds"}}];
                            return obj;


        // var template = "select [[func]]([[column]]) from [[series]] where [[timeFilter]] group by time([[interval]]) order asc";

        // var templateData = {
        //   series: target.series,
        //   column: target.column,
        //   func: target.function,
        //   interval: target.interval || options.interval
        // };
        // var query = _.template(template, templateData, this.templateSettings);
      })
      .value();

      console.log("Payload2", payload);

      var query = {
          method: 'POST',
          url: '/api/v1/datapoints/query',
          data: payload
          // headers: {
          //   'Content-Type': 'application/x-www-form-urlencoded',
          // }
        };
      return this.doKairosDBRequest(query).then(handleKairosDBQueryResponse);

    };
/*
    GraphiteDatasource.prototype.query = function(options) {
      try {
        var graphOptions = {
          from: this.translateTime(options.range.from),
          until: this.translateTime(options.range.to),
          targets: options.targets,
          format: options.format,
          maxDataPoints: options.maxDataPoints,
        };

        var params = this.buildGraphiteParams(graphOptions);

        if (options.format === 'png') {
          return $q.when(this.url + '/render' + '?' + params.join('&'));
        }

        return this.doGraphiteRequest({
          method: 'POST',
          url: '/render',
          data: params.join('&'),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        });
      }
      catch(err) {
        return $q.reject(err);
      }
    };

    GraphiteDatasource.prototype.events = function(options) {
      try {
        var tags = '';
        if (options.tags) {
          tags = '&tags=' + options.tags;
        }

        return this.doGraphiteRequest({
          method: 'GET',
          url: '/events/get_data?from=' + this.translateTime(options.range.from) + '&until=' + this.translateTime(options.range.to) + tags,
        });
      }
      catch(err) {
        return $q.reject(err);
      }
    };


*/

    // KairosDBDatasource.prototype.listColumns = function(seriesName) {
    //   return this.doKairosDBRequest('select * from ' + seriesName + ' limit 1').then(function(results) {
    //     console.log('response!');
    //     if (!results.data) {
    //       return [];
    //     }

    //     return results.data[0].columns;
    //   });
    // };

    KairosDBDatasource.prototype.listSeries = function() {
      return this.doKairosDBRequest({url:'/api/v1/metricnames'}).then(function(results) {
        if (!results.data) {
          return [];
        }

        return results.data.results
      });
    };

    KairosDBDatasource.prototype.doKairosDBRequest = function(options) {
      if (!options.method) {
        options.method = 'GET';
      }

      options.url = this.url + options.url;

      console.log(options);
      return $http(options);
    };

    function handleKairosDBQueryResponse(results) {
      var output = [];

      _.each(results.data.queries, function(series) {
        var sample_size = series.sample_size;
          console.log("sample_size:"+sample_size + " samples");

        _.each(series.results, function(result, index) {

          console.log("result:"+result.name + ": "+result.values.length + " points");

          var target = result.name;
          var datapoints = [];

          for(var i = 0; i < result.values.length; i++) {
            var t = Math.floor(result.values[i][0] / 1000);
            var v = result.values[i][1];
            datapoints[i] = [v,t];
          }

          output.push({ target:target, datapoints:datapoints });
        });
      });

      var output2 = { data: _.flatten(output) };
      console.log("output2: ", output2);

      return output2;
    }

    KairosDBDatasource.prototype.translateTime = function(date, response_obj, start_stop_name) {
      console.log("translateTime ", date);
      if (_.isString(date)) {
        if (date === 'now') {
          return;
        }
        else if (date.indexOf('now-') >= 0) {
          name = start_stop_name + "_relative";

          date = date.substring(4);
          var re_date = /(\d+)\s*(\D+)/;
          var result = re_date.exec(date);
          if (result) {
            var value = result[1];
            var unit = result[2];
            switch(unit) {
              case 'ms':
                unit = 'milliseconds';
                break;
              case 's':
                unit = 'seconds';
                break;
              case 'm':
                unit = 'minutes';
                break;
              case 'h':
                unit = 'hours';
                break;
              case 'd':
                unit = 'days';
                break;
              case 'w':
                unit = 'weeks';
                break;
              case 'M':
                unit = 'months';
                break;
              case 'y':
                unit = 'years';
                break;
              default:
                console.log("Unknown date ", date);
                break;
            }
            response_obj[name] = {
              "value": value,
              "unit": unit
            };
            return;
          }
          console.log("Unparseable date", date);
          return;
        }

        date = kbn.parseDate(date);
      }
      name = start_stop_name + "_absolute";

      date = moment.utc(date);

      if (dashboard.current.timezone === 'browser') {
        date = date.local();
      }

      if (config.timezoneOffset) {
        date = date.zone(config.timezoneOffset);
      }

      response_obj[name] = date.valueOf();
    };

    KairosDBDatasource.prototype.datetime = function(kibana_datetime) {

      var date = kbn.parseDate(kibana_datetime);
      date = moment.utc(date);
      return date;
    };

    KairosDBDatasource.prototype.deltaTime = function(start, end) {
      var startdate = this.datetime(start);
      var enddate = this.datetime(end);

      var delta = enddate.diff(startdate, 'milliseconds');
      return delta;
    };

    return KairosDBDatasource;

  });

});

/*
    GraphiteDatasource.prototype.metricFindQuery = function(query) {
      var interpolated;
      try {
        interpolated = filterSrv.applyFilterToTarget(query);
      }
      catch(err) {
        return $q.reject(err);
      }

      return this.doGraphiteRequest({method: 'GET', url: '/metrics/find/?query=' + interpolated })
        .then(function(results) {
          return _.map(results.data, function(metric) {
            return {
              text: metric.text,
              expandable: metric.expandable ? true : false
            };
          });
        });
    };

    GraphiteDatasource.prototype.buildGraphiteParams = function(options) {
      var clean_options = [];
      var graphite_options = ['target', 'targets', 'from', 'until', 'rawData', 'format', 'maxDataPoints'];

      if (options.format !== 'png') {
        options['format'] = 'json';
      }

      _.each(options, function (value, key) {
        if ($.inArray(key, graphite_options) === -1) {
          return;
        }

        if (key === "targets") {
          _.each(value, function (value) {
            if (!value.hide) {
              var targetValue = filterSrv.applyFilterToTarget(value.target);
              clean_options.push("target=" + encodeURIComponent(targetValue));
            }
          }, this);
        }
        else if (value !== null) {
          clean_options.push(key + "=" + encodeURIComponent(value));
        }
      }, this);
      return clean_options;
    };


    return GraphiteDatasource;

  });

});

*/
