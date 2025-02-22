/* *
 *
 *  (c) 2009-2021 Øystein Moseng
 *
 *  Sonification functions for chart/series.
 *
 *  License: www.highcharts.com/license
 *
 *  !!!!!!! SOURCE GETS TRANSPILED BY TYPESCRIPT. EDIT TS FILE ONLY. !!!!!!!
 *
 * */

'use strict';

/* *
 *
 *  Imports
 *
 * */

import type Chart from '../../Core/Chart/Chart';
import type { DefaultSonificationInstrumentOptions } from './SonificationOptions';
import type Earcon from './Earcon';
import type Options from '../../Core/Options';
import type PointSonify from './PointSonify';
import type RangeSelector from '../../Extensions/RangeSelector';

import Point from '../../Core/Series/Point.js';
import SeriesSonify from './SeriesSonify.js';
import Sonification from './Sonification.js';
import SU from './SonificationUtilities.js';
const {
    getExtremesForInstrumentProps,
    virtualAxisTranslate
} = SU;
import U from '../../Core/Utilities.js';
const {
    addEvent,
    extend,
    merge,
    pick,
    splat
} = U;

/* *
 *
 *  Declarations
 *
 * */

interface SonifySeriesOrderObject {
    series: SeriesSonify.Composition;
    seriesOptions: SeriesSonify.SonifySeriesOptions;
}

declare class Composition { // = interface SonifyableChart extends Chart {
    cancelSonify: typeof cancel;
    getCurrentSonifyPoints: typeof getCurrentPoints;
    pauseSonify: typeof pause;
    resetSonifyCursor: typeof resetCursor;
    resetSonifyCursorEnd: typeof resetCursorEnd;
    resumeSonify: typeof resume;
    rewindSonify: typeof rewind;
    series: Array<SeriesSonify.Composition>;
    setSonifyCursor: typeof setCursor;
    sonification: ChartSonify.ChartSonificationStateObject;
    sonify: typeof chartSonify;
}

/* *
 *
 *  Functions
 *
 * */

/* eslint-disable valid-jsdoc */

/**
 * Utility function to normalize the ordering of timeline paths when sonifying
 * a chart.
 * @private
 * @param {string|Array<string|Highcharts.Earcon|Array<string|Highcharts.Earcon>>} orderOptions -
 * Order options for the sonification.
 * @param {Highcharts.Chart} chart - The chart we are sonifying.
 * @param {Function} seriesOptionsCallback
 * A function that takes a series as argument, and returns the series options
 * for that series to be used with buildTimelinePathFromSeries.
 * @return {Array<object|Array<object|Highcharts.TimelinePath>>} If order is
 * sequential, we return an array of objects to create series paths from. If
 * order is simultaneous we return an array of an array with the same. If there
 * is a custom order, we return an array of arrays of either objects (for
 * series) or TimelinePaths (for earcons and delays).
 */
function buildPathOrder(
    orderOptions: (
        string|Array<(string|Earcon|
        Array<(string|Earcon)>)>
    ),
    chart: ChartSonify.SonifyableChart,
    seriesOptionsCallback: Function
): Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)> {
    let order: Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)>;

    if (orderOptions === 'sequential' || orderOptions === 'simultaneous') {
        // Just add the series from the chart
        order = chart.series.reduce(function (
            seriesList: Array<SonifySeriesOrderObject>,
            series: SeriesSonify.Composition
        ): Array<SonifySeriesOrderObject> {
            if (
                series.visible &&
                (
                    series.options.sonification &&
                    series.options.sonification.enabled
                ) !== false
            ) {
                seriesList.push({
                    series: series,
                    seriesOptions: seriesOptionsCallback(series)
                });
            }
            return seriesList;
        }, []);

        // If order is simultaneous, group all series together
        if (orderOptions === 'simultaneous') {
            order = [order] as any;
        }
    } else {
        // We have a specific order, and potentially custom items - like
        // earcons or silent waits.
        order = (orderOptions as any).reduce(function (
            orderList: Array<Array<(
                SonifySeriesOrderObject|Highcharts.TimelinePath
            )>>,
            orderDef: (
                string|Earcon|Array<string|Earcon>
            )
        ): Array<Array<(
                SonifySeriesOrderObject|Highcharts.TimelinePath
            )>> {
            // Return set of items to play simultaneously. Could be only one.
            const simulItems: Array<(
                SonifySeriesOrderObject|Highcharts.TimelinePath
            )> = splat(orderDef).reduce(function (
                items: Array<(
                    SonifySeriesOrderObject|Highcharts.TimelinePath
                )>,
                item: (string|Earcon)
            ): Array<(
                    SonifySeriesOrderObject|Highcharts.TimelinePath
                )> {
                let itemObject: (
                    SonifySeriesOrderObject|Highcharts.TimelinePath|
                    undefined
                );

                // Is this item a series ID?
                if (typeof item === 'string') {
                    const series: SeriesSonify.Composition = (
                        chart.get(item) as any
                    );

                    if (series.visible) {
                        itemObject = {
                            series: series,
                            seriesOptions: seriesOptionsCallback(series)
                        };
                    }

                // Is it an earcon? If so, just create the path.
                } else if (item instanceof Sonification.Earcon) {
                    // Path with a single event
                    itemObject = new Sonification.TimelinePath({
                        events: [new Sonification.TimelineEvent({
                            eventObject: item
                        })]
                    });

                }

                // Is this item a silent wait? If so, just create the path.
                if ((item as any).silentWait) {
                    itemObject = new Sonification.TimelinePath({
                        silentWait: (item as any).silentWait
                    } as any);
                }

                // Add to items to play simultaneously
                if (itemObject) {
                    items.push(itemObject);
                }
                return items;
            }, []);

            // Add to order list
            if (simulItems.length) {
                orderList.push(simulItems);
            }
            return orderList;
        }, []);
    }
    return order;
}

/**
 * Utility function to add a silent wait after all series.
 * @private
 * @param {Array<object|Array<object|TimelinePath>>} order
 * The order of items.
 * @param {number} wait
 * The wait in milliseconds to add.
 * @return {Array<object|Array<object|TimelinePath>>}
 * The order with waits inserted.
 */
function addAfterSeriesWaits(
    order: Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)>,
    wait: number
): Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)> {
    if (!wait) {
        return order;
    }

    return order.reduce(function (
        newOrder: Array<(SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>)>,
        orderDef: (SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>),
        i: number
    ): Array<(SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>)> {
        const simultaneousPaths: Array<(
            SonifySeriesOrderObject|
            Highcharts.TimelinePath
        )> = splat(orderDef);

        newOrder.push(simultaneousPaths);

        // Go through the simultaneous paths and see if there is a series there
        if (
            i < order.length - 1 && // Do not add wait after last series
            simultaneousPaths.some(function (
                item: (
                    SonifySeriesOrderObject|Highcharts.TimelinePath
                )
            ): (SeriesSonify.Composition|undefined) {
                return (item as any).series;
            })
        ) {
            // We have a series, meaning we should add a wait after these
            // paths have finished.
            newOrder.push(new Sonification.TimelinePath({
                silentWait: wait
            } as any) as any);
        }

        return newOrder;
    }, []);
}

/**
 * Utility function to find the total amout of wait time in the TimelinePaths.
 * @private
 * @param {Array<object|Array<object|TimelinePath>>} order - The order of
 * TimelinePaths/items.
 * @return {number} The total time in ms spent on wait paths between playing.
 */
function getWaitTime(
    order: Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)>
): number {
    return order.reduce(function (
        waitTime: number,
        orderDef: (SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>)
    ): number {
        const def: Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )> = splat(orderDef);

        return waitTime + (
            def.length === 1 &&
            (def[0] as any).options &&
            (def[0] as any).options.silentWait || 0
        );
    }, 0);
}

/**
 * Utility function to ensure simultaneous paths have start/end events at the
 * same time, to sync them.
 * @private
 * @param {Array<Highcharts.TimelinePath>} paths - The paths to sync.
 */
function syncSimultaneousPaths(paths: Array<Highcharts.TimelinePath>): void {
    // Find the extremes for these paths
    const extremes = paths.reduce(function (
        extremes: RangeSelector.RangeObject,
        path: Highcharts.TimelinePath
    ): RangeSelector.RangeObject {
        const events = path.events;

        if (events && events.length) {
            extremes.min = Math.min(events[0].time, extremes.min);
            extremes.max = Math.max(
                events[events.length - 1].time, extremes.max
            );
        }
        return extremes;
    }, {
        min: Infinity,
        max: -Infinity
    });

    // Go through the paths and add events to make them fit the same timespan
    paths.forEach(function (path: Highcharts.TimelinePath): void {
        const events = path.events,
            hasEvents = events && events.length,
            eventsToAdd = [];

        if (!(hasEvents && events[0].time <= extremes.min)) {
            eventsToAdd.push(new Sonification.TimelineEvent({
                time: extremes.min
            }));
        }
        if (!(hasEvents && events[events.length - 1].time >= extremes.max)) {
            eventsToAdd.push(new Sonification.TimelineEvent({
                time: extremes.max
            }));
        }
        if (eventsToAdd.length) {
            path.addTimelineEvents(eventsToAdd);
        }
    });
}

/**
 * Utility function to find the total duration span for all simul path sets
 * that include series.
 * @private
 * @param {Array<object|Array<object|Highcharts.TimelinePath>>} order - The
 * order of TimelinePaths/items.
 * @return {number} The total time value span difference for all series.
 */
function getSimulPathDurationTotal(
    order: Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)>
): number {
    return order.reduce(function (
        durationTotal: number,
        orderDef: (SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>)
    ): number {
        return durationTotal + splat(orderDef).reduce(
            function (
                maxPathDuration: number,
                item: (
                    SonifySeriesOrderObject|Highcharts.TimelinePath
                )
            ): number {
                const timeExtremes: RangeSelector.RangeObject = (
                    (item as any).series &&
                    (item as any).seriesOptions &&
                    (item as any).seriesOptions.timeExtremes
                );

                return timeExtremes ?
                    Math.max(
                        maxPathDuration, timeExtremes.max - timeExtremes.min
                    ) : maxPathDuration;
            },
            0
        );
    }, 0);
}

/**
 * Function to calculate the duration in ms for a series.
 * @private
 * @param {number} seriesValueDuration - The duration of the series in value
 * difference.
 * @param {number} totalValueDuration - The total duration of all (non
 * simultaneous) series in value difference.
 * @param {number} totalDurationMs - The desired total duration for all series
 * in milliseconds.
 * @return {number} The duration for the series in milliseconds.
 */
function getSeriesDurationMs(
    seriesValueDuration: number,
    totalValueDuration: number,
    totalDurationMs: number
): number {
    // A series spanning the whole chart would get the full duration.
    return virtualAxisTranslate(
        seriesValueDuration,
        { min: 0, max: totalValueDuration },
        { min: 0, max: totalDurationMs }
    );
}

/**
 * Convert series building objects into paths and return a new list of
 * TimelinePaths.
 * @private
 * @param {Array<object|Array<object|Highcharts.TimelinePath>>} order - The
 * order list.
 * @param {number} duration - Total duration to aim for in milliseconds.
 * @return {Array<Array<Highcharts.TimelinePath>>} Array of TimelinePath objects
 * to play.
 */
function buildPathsFromOrder(
    order: Array<(SonifySeriesOrderObject|Array<(
        SonifySeriesOrderObject|Highcharts.TimelinePath
    )>)>,
    duration: number
): Array<Array<Highcharts.TimelinePath>> {
    // Find time used for waits (custom or after series), and subtract it from
    // available duration.
    const totalAvailableDurationMs = Math.max(
            duration - getWaitTime(order), 0
        ),
        // Add up simultaneous path durations to find total value span duration
        // of everything
        totalUsedDuration = getSimulPathDurationTotal(order);

    // Go through the order list and convert the items
    return order.reduce(function (
        allPaths: Array<Array<Highcharts.TimelinePath>>,
        orderDef: (SonifySeriesOrderObject|Array<(
            SonifySeriesOrderObject|Highcharts.TimelinePath
        )>)
    ): Array<Array<Highcharts.TimelinePath>> {
        const simultaneousPaths: Array<Highcharts.TimelinePath> =
            splat(orderDef).reduce(function (
                simulPaths: Array<Highcharts.TimelinePath>,
                item: (
                    SonifySeriesOrderObject|Highcharts.TimelinePath
                )
            ): Array<Highcharts.TimelinePath> {
                if (item instanceof Sonification.TimelinePath) {
                    // This item is already a path object
                    simulPaths.push(item);
                } else if (item.series) {
                    // We have a series.
                    // We need to set the duration of the series
                    item.seriesOptions.duration =
                        item.seriesOptions.duration || getSeriesDurationMs(
                            (item.seriesOptions.timeExtremes as any).max -
                            (item.seriesOptions.timeExtremes as any).min,
                            totalUsedDuration,
                            totalAvailableDurationMs
                        );

                    // Add the path
                    simulPaths.push(SeriesSonify.buildTimelinePathFromSeries(
                        item.series,
                        item.seriesOptions
                    ));
                }
                return simulPaths;
            }, []);

        // Add in the simultaneous paths
        allPaths.push(simultaneousPaths);
        return allPaths;
    }, []);
}

/**
 * @private
 * @param {Highcharts.Chart} chart The chart to get options for.
 * @param {Highcharts.SonificationOptions} options
 *  Options to merge with user options on chart and default options.
 * @return {Highcharts.SonificationOptions} The merged options.
 */
function getChartSonifyOptions(
    chart: ChartSonify.SonifyableChart,
    options?: ChartSonify.SonifyChartOptionsObject
): ChartSonify.SonifyChartOptionsObject {
    const chartOpts: AnyRecord = chart.options.sonification || {};

    return merge(
        {
            duration: chartOpts.duration,
            afterSeriesWait: chartOpts.afterSeriesWait,
            pointPlayTime: (
                chartOpts.defaultInstrumentOptions &&
                chartOpts.defaultInstrumentOptions.mapping &&
                chartOpts.defaultInstrumentOptions.mapping.pointPlayTime
            ),
            order: chartOpts.order,
            onSeriesStart: (chartOpts.events && chartOpts.events.onSeriesStart),
            onSeriesEnd: (chartOpts.events && chartOpts.events.onSeriesEnd),
            onEnd: (chartOpts.events && chartOpts.events.onEnd)
        },
        options
    );
}

/**
 * Sonify a chart.
 *
 * @sample highcharts/sonification/chart-sequential/
 *         Sonify a basic chart
 * @sample highcharts/sonification/chart-simultaneous/
 *         Sonify series simultaneously
 * @sample highcharts/sonification/chart-custom-order/
 *         Custom defined order of series
 * @sample highcharts/sonification/chart-earcon/
 *         Earcons on chart
 * @sample highcharts/sonification/chart-events/
 *         Sonification events on chart
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#sonify
 *
 * @param {Highcharts.SonificationOptions} [options]
 * The options for sonifying this chart. If not provided,
 * uses options set on chart and series.
 */
function chartSonify(
    this: ChartSonify.SonifyableChart,
    options?: ChartSonify.SonifyChartOptionsObject
): void {
    const opts = getChartSonifyOptions(this, options);

    // Only one timeline can play at a time.
    if (this.sonification.timeline) {
        this.sonification.timeline.pause();
    }

    // Store reference to duration
    this.sonification.duration = opts.duration;

    // Calculate data extremes for the props used
    const dataExtremes = getExtremesForInstrumentProps(
        this, opts.instruments, opts.dataExtremes
    );

    // Figure out ordering of series and custom paths
    let order = buildPathOrder(opts.order, this, function (
        series: SeriesSonify.Composition
    ): Partial<SeriesSonify.SonifySeriesOptions> {
        return SeriesSonify.buildChartSonifySeriesOptions(series, dataExtremes, opts);
    });

    // Add waits after simultaneous paths with series in them.
    order = addAfterSeriesWaits(order, opts.afterSeriesWait || 0);

    // We now have a list of either TimelinePath objects or series that need to
    // be converted to TimelinePath objects. Convert everything to paths.
    const paths = buildPathsFromOrder(order, opts.duration);

    // Sync simultaneous paths
    paths.forEach(function (
        simultaneousPaths: Array<Highcharts.TimelinePath>
    ): void {
        syncSimultaneousPaths(simultaneousPaths);
    });

    // We have a set of paths. Create the timeline, and play it.
    this.sonification.timeline = new Sonification.Timeline({
        paths: paths,
        onEnd: opts.onEnd
    });
    this.sonification.timeline.play();
}

/**
 * Get a list of the points currently under cursor.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#getCurrentSonifyPoints
 *
 * @return {Array<Highcharts.Point>}
 *         The points currently under the cursor.
 */
function getCurrentPoints(
    this: ChartSonify.SonifyableChart
): Array<Point> {
    let cursorObj: Record<string, Highcharts.TimelineEvent>;

    if (this.sonification.timeline) {
        cursorObj = this.sonification.timeline.getCursor(); // Cursor per pathID
        return Object.keys(cursorObj).map(function (
            path: string
        ): any {
            // Get the event objects under cursor for each path
            return cursorObj[path].eventObject;
        }).filter(function (eventObj: any): boolean {
            // Return the events that are points
            return eventObj instanceof Point;
        });
    }
    return [];
}

/**
 * Set the cursor to a point or set of points in different series.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#setSonifyCursor
 *
 * @param {Highcharts.Point|Array<Highcharts.Point>} points
 *        The point or points to set the cursor to. If setting multiple points
 *        under the cursor, the points have to be in different series that are
 *        being played simultaneously.
 */
function setCursor(
    this: ChartSonify.SonifyableChart,
    points: (Point|Array<Point>)
): void {
    const timeline: Highcharts.Timeline = this.sonification.timeline as any;

    if (timeline) {
        splat(points).forEach(function (point: Point): void {
            // We created the events with the ID of the points, which makes
            // this easy. Just call setCursor for each ID.
            timeline.setCursor(point.id);
        });
    }
}

/**
 * Pause the running sonification.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#pauseSonify
 *
 * @param {boolean} [fadeOut=true]
 *        Fade out as we pause to avoid clicks.
 *
 * @return {void}
 */
function pause(this: ChartSonify.SonifyableChart, fadeOut?: boolean): void {
    if (this.sonification.timeline) {
        this.sonification.timeline.pause(pick(fadeOut, true));
    } else if (this.sonification.currentlyPlayingPoint) {
        this.sonification.currentlyPlayingPoint.cancelSonify(fadeOut);
    }
}

/**
 * Resume the currently running sonification. Requires series.sonify or
 * chart.sonify to have been played at some point earlier.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#resumeSonify
 *
 * @param {Function} onEnd
 *        Callback to call when play finished.
 *
 * @return {void}
 */
function resume(this: ChartSonify.SonifyableChart, onEnd: Function): void {
    if (this.sonification.timeline) {
        this.sonification.timeline.play(onEnd);
    }
}

/**
 * Play backwards from cursor. Requires series.sonify or chart.sonify to have
 * been played at some point earlier.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#rewindSonify
 *
 * @param {Function} onEnd
 *        Callback to call when play finished.
 *
 * @return {void}
 */
function rewind(this: ChartSonify.SonifyableChart, onEnd: Function): void {
    if (this.sonification.timeline) {
        this.sonification.timeline.rewind(onEnd);
    }
}

/**
 * Cancel current sonification and reset cursor.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#cancelSonify
 *
 * @param {boolean} [fadeOut=true]
 *        Fade out as we pause to avoid clicks.
 *
 * @return {void}
 */
function cancel(this: ChartSonify.SonifyableChart, fadeOut?: boolean): void {
    this.pauseSonify(fadeOut);
    this.resetSonifyCursor();
}

/**
 * Reset cursor to start. Requires series.sonify or chart.sonify to have been
 * played at some point earlier.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#resetSonifyCursor
 *
 * @return {void}
 */
function resetCursor(this: ChartSonify.SonifyableChart): void {
    if (this.sonification.timeline) {
        this.sonification.timeline.resetCursor();
    }
}

/**
 * Reset cursor to end. Requires series.sonify or chart.sonify to have been
 * played at some point earlier.
 *
 * @requires module:modules/sonification
 *
 * @function Highcharts.Chart#resetSonifyCursorEnd
 *
 * @return {void}
 */
function resetCursorEnd(this: ChartSonify.SonifyableChart): void {
    if (this.sonification.timeline) {
        this.sonification.timeline.resetCursorEnd();
    }
}

const composedClasses: Array<Function> = [];
/**
 * @private
 * @todo move to composition namespace with all functions
 */
function compose<T extends typeof Chart>(ChartClass: typeof Chart): (T&typeof Composition) {

    if (composedClasses.indexOf(ChartClass) === -1) {
        composedClasses.push(ChartClass);

        const chartProto = ChartClass.prototype as ChartSonify.SonifyableChart;

        extend(chartProto, {
            sonify: chartSonify,
            pauseSonify: pause,
            resumeSonify: resume,
            rewindSonify: rewind,
            cancelSonify: cancel,
            getCurrentSonifyPoints: getCurrentPoints,
            setSonifyCursor: setCursor,
            resetSonifyCursor: resetCursor,
            resetSonifyCursorEnd: resetCursorEnd
        });

        // Prepare charts for sonification on init
        addEvent(ChartClass, 'init', function (): void {
            this.sonification = {};
        });

        // Update with chart/series/point updates
        addEvent(ChartClass, 'update', function (
            e: { options: Options }
        ): void {
            const newOptions = e.options.sonification;
            if (newOptions) {
                merge(true, this.options.sonification, newOptions);
            }
        });

    }

    return ChartClass as (T&typeof Composition);
}

/* *
 *
 *  Namespace
 *
 * */

namespace ChartSonify {

    /* *
     *
     *  Declarations
     *
     * */

    export interface ChartSonificationEventsOptions {
        onEnd?: Function;
        onPointEnd?: Function;
        onPointStart?: Function;
        onSeriesEnd?: Function;
        onSeriesStart?: Function;
    }

    export interface ChartSonificationOptions {
        afterSeriesWait?: number;
        dataExtremes?: Record<string, RangeSelector.RangeObject>;
        defaultInstrumentOptions?: DefaultSonificationInstrumentOptions;
        duration: number;
        earcons?: Array<Earcon.Configuration>;
        enabled?: boolean;
        events?: ChartSonificationEventsOptions;
        masterVolume?: number;
        order: (string|Array<string|Earcon|Array<string|Earcon>>);
    }

    export interface ChartSonificationStateObject {
        currentlyPlayingPoint?: Highcharts.SonifyablePoint;
        timeline?: Highcharts.Timeline;
        duration?: number;
    }

    export interface SonifyableChart extends Chart {
        cancelSonify: typeof cancel;
        getCurrentSonifyPoints: typeof getCurrentPoints;
        pauseSonify: typeof pause;
        resetSonifyCursor: typeof resetCursor;
        resetSonifyCursorEnd: typeof resetCursorEnd;
        resumeSonify: typeof resume;
        rewindSonify: typeof rewind;
        series: Array<SeriesSonify.Composition>;
        setSonifyCursor: typeof setCursor;
        sonification: ChartSonificationStateObject;
        sonify: typeof chartSonify;
    }

    export interface SonifyChartOptionsObject {
        afterSeriesWait?: number;
        dataExtremes?: Record<string, RangeSelector.RangeObject>;
        duration: number;
        earcons?: Array<Earcon.Configuration>;
        instruments?: Array<PointSonify.PointInstrument>;
        masterVolume?: number;
        onSeriesEnd?: Function;
        onSeriesStart?: Function;
        onEnd?: Function;
        order: (string|Array<string|Earcon|Array<string|Earcon>>);
        pointPlayTime: (string|Function);
        seriesOptions?: (
            SeriesSonify.SonifySeriesOptions|Array<SeriesSonify.SonifySeriesOptions>
        );
    }

}


/* *
 *
 *  Default Export
 *
 * */

const ChartSonify = {
    chartSonify,
    compose,
    pause,
    resume,
    rewind,
    cancel,
    getCurrentPoints,
    setCursor,
    resetCursor,
    resetCursorEnd
};

export default ChartSonify;

/* *
 *
 *  API Declarations
 *
 * */

/**
 * An Earcon configuration, specifying an Earcon and when to play it.
 *
 * @requires module:modules/sonification
 *
 * @interface Highcharts.EarconConfiguration
 *//**
 * An Earcon instance.
 * @name Highcharts.EarconConfiguration#earcon
 * @type {Highcharts.Earcon}
 *//**
 * The ID of the point to play the Earcon on.
 * @name Highcharts.EarconConfiguration#onPoint
 * @type {string|undefined}
 *//**
 * A function to determine whether or not to play this earcon on a point. The
 * function is called for every point, receiving that point as parameter. It
 * should return either a boolean indicating whether or not to play the earcon,
 * or a new Earcon instance - in which case the new Earcon will be played.
 * @name Highcharts.EarconConfiguration#condition
 * @type {Function|undefined}
 */

/**
 * Options for sonifying a chart.
 *
 * @requires module:modules/sonification
 *
 * @interface Highcharts.SonificationOptions
 *//**
 * Duration for sonifying the entire chart. The duration is distributed across
 * the different series intelligently, but does not take earcons into account.
 * It is also possible to set the duration explicitly per series, using
 * `seriesOptions`. Note that points may continue to play after the duration has
 * passed, but no new points will start playing.
 * @name Highcharts.SonificationOptions#duration
 * @type {number}
 *//**
 * Define the order to play the series in. This can be given as a string, or an
 * array specifying a custom ordering. If given as a string, valid values are
 * `sequential` - where each series is played in order - or `simultaneous`,
 * where all series are played at once. For custom ordering, supply an array as
 * the order. Each element in the array can be either a string with a series ID,
 * an Earcon object, or an object with a numeric `silentWait` property
 * designating a number of milliseconds to wait before continuing. Each element
 * of the array will be played in order. To play elements simultaneously, group
 * the elements in an array.
 * @name Highcharts.SonificationOptions#order
 * @type {string|Array<string|Highcharts.Earcon|Array<string|Highcharts.Earcon>>}
 *//**
 * The axis to use for when to play the points. Can be a string with a data
 * property (e.g. `x`), or a function. If it is a function, this function
 * receives the point as argument, and should return a numeric value. The points
 * with the lowest numeric values are then played first, and the time between
 * points will be proportional to the distance between the numeric values. This
 * option can not be overridden per series.
 * @name Highcharts.SonificationOptions#pointPlayTime
 * @type {string|Function}
 *//**
 * Milliseconds of silent waiting to add between series. Note that waiting time
 * is considered part of the sonify duration.
 * @name Highcharts.SonificationOptions#afterSeriesWait
 * @type {number|undefined}
 *//**
 * Options as given to `series.sonify` to override options per series. If the
 * option is supplied as an array of options objects, the `id` property of the
 * object should correspond to the series' id. If the option is supplied as a
 * single object, the options apply to all series.
 * @name Highcharts.SonificationOptions#seriesOptions
 * @type {Object|Array<object>|undefined}
 *//**
 * The instrument definitions for the points in this chart.
 * @name Highcharts.SonificationOptions#instruments
 * @type {Array<Highcharts.PointInstrumentObject>|undefined}
 *//**
 * Earcons to add to the chart. Note that earcons can also be added per series
 * using `seriesOptions`.
 * @name Highcharts.SonificationOptions#earcons
 * @type {Array<Highcharts.EarconConfiguration>|undefined}
 *//**
 * Optionally provide the minimum/maximum data values for the points. If this is
 * not supplied, it is calculated from all points in the chart on demand. This
 * option is supplied in the following format, as a map of point data properties
 * to objects with min/max values:
 *  ```js
 *      dataExtremes: {
 *          y: {
 *              min: 0,
 *              max: 100
 *          },
 *          z: {
 *              min: -10,
 *              max: 10
 *          }
 *          // Properties used and not provided are calculated on demand
 *      }
 *  ```
 * @name Highcharts.SonificationOptions#dataExtremes
 * @type {Highcharts.Dictionary<Highcharts.RangeObject>|undefined}
 *//**
 * Callback before a series is played.
 * @name Highcharts.SonificationOptions#onSeriesStart
 * @type {Function|undefined}
 *//**
 * Callback after a series has finished playing.
 * @name Highcharts.SonificationOptions#onSeriesEnd
 * @type {Function|undefined}
 *//**
 * Callback after the chart has played.
 * @name Highcharts.SonificationOptions#onEnd
 * @type {Function|undefined}
 */

/**
 * Options for sonifying a series.
 *
 * @requires module:modules/sonification
 *
 * @interface Highcharts.SonifySeriesOptionsObject
 *//**
 * The duration for playing the points. Note that points might continue to play
 * after the duration has passed, but no new points will start playing.
 * @name Highcharts.SonifySeriesOptionsObject#duration
 * @type {number}
 *//**
 * The axis to use for when to play the points. Can be a string with a data
 * property (e.g. `x`), or a function. If it is a function, this function
 * receives the point as argument, and should return a numeric value. The points
 * with the lowest numeric values are then played first, and the time between
 * points will be proportional to the distance between the numeric values.
 * @name Highcharts.SonifySeriesOptionsObject#pointPlayTime
 * @type {string|Function}
 *//**
 * The instrument definitions for the points in this series.
 * @name Highcharts.SonifySeriesOptionsObject#instruments
 * @type {Array<Highcharts.PointInstrumentObject>}
 *//**
 * Earcons to add to the series.
 * @name Highcharts.SonifySeriesOptionsObject#earcons
 * @type {Array<Highcharts.EarconConfiguration>|undefined}
 *//**
 * Optionally provide the minimum/maximum data values for the points. If this is
 * not supplied, it is calculated from all points in the chart on demand. This
 * option is supplied in the following format, as a map of point data properties
 * to objects with min/max values:
 * ```js
 *     dataExtremes: {
 *         y: {
 *             min: 0,
 *             max: 100
 *         },
 *         z: {
 *             min: -10,
 *             max: 10
 *         }
 *         // Properties used and not provided are calculated on demand
 *     }
 * ```
 * @name Highcharts.SonifySeriesOptionsObject#dataExtremes
 * @type {Highcharts.Dictionary<Highcharts.RangeObject>|undefined}
 *//**
 * Callback before a point is played.
 * @name Highcharts.SonifySeriesOptionsObject#onPointStart
 * @type {Function|undefined}
 *//**
 * Callback after a point has finished playing.
 * @name Highcharts.SonifySeriesOptionsObject#onPointEnd
 * @type {Function|undefined}
 *//**
 * Callback after the series has played.
 * @name Highcharts.SonifySeriesOptionsObject#onEnd
 * @type {Function|undefined}
 */

''; // detach doclets above
