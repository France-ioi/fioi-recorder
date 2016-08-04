
import React from 'react';
import EpicComponent from 'epic-component';
import classnames from 'classnames';
import {ViewerResponsive, ViewerHelper} from 'react-svg-pan-zoom';
import range from 'node-range';

import {getIdent, getNumber, getList, viewVariable, renderValue} from './utils';
import {ArrayViewBuilder, getArrayMapper1D, readArray1D} from './array_utils';

export const Array1D = EpicComponent(self => {

  // @11px, line height 15, offset 12
  const textLineHeight = 18;
  const textBaseline = 5; // from bottom
  const minArrowHeight = 20;
  const cursorRows = 2;
  const cellWidth = 28;
  const cellHeight = (3 + cursorRows) * textLineHeight + minArrowHeight;
  const pointsByKind = {
    cursor: 300,
    store: 100,
    load: 50,
    first: 25,
    last: 20
  };

  //
  // View model preparation
  //

  const extractView = function (fullView) {
    const {directive, controls, frames, context} = self.props;
    const {core} = context;
    // 'name' is the first positional argument
    const {byName, byPos} = directive;
    const cursorNames = getList(byName.cursors, []).map(getIdent);
    const maxVisibleCells = getNumber(byName.n, 40);
    const name = getIdent(byPos[0]);
    // Use the topmost frame.
    // TODO: look in globals if frames.length === 0
    const frame = frames[0];
    const localMap = frame.get('localMap');
    if (!localMap.has(name)) {
      return {error: <p>{name}{" not in scope"}</p>};
    }
    const {type, ref} = localMap.get(name);
    // Expect an array declaration.
    if (type.kind !== 'array') {
      return {error: <p>{"value is not an array"}</p>};
    }
    const elemCount = type.count.toInteger();
    const cellOpsMap = getCellOpsMap(core, ref);
    const cursorMap = getCursorMap(cursorNames, elemCount, core, localMap);
    const selection =
      fullView
        ? range(0, elemCount + 1)
        : getSelection(maxVisibleCells, elemCount, cellOpsMap, cursorMap);
    const cells = readArray1D(core, type, ref.address, selection, cellOpsMap);
    const cursors = getCursors(selection, cursorMap);
    return {cells, cursors};
  };

  // Returns a map keyed by cell index, and whose values are objects giving
  // the greatest rank in the memory log of a 'load' or 'store' operation.
  const getCellOpsMap = function (core, ref) {
    // Go through the memory log, translate memory-operation references into
    // array cells indexes, and save the cell load/store operations in cellOps.
    const cellOpsMap = [];
    const forEachCell = getArrayMapper1D(ref);
    core.memoryLog.forEach(function (entry, i) {
      const op = entry[0]; // 'load' or 'store'
      forEachCell(entry[1], function (index) {
        let cellOps;
        if (index in cellOpsMap) {
          cellOps = cellOpsMap[index];
        } else {
          cellOps = cellOpsMap[index] = {};
        }
        cellOps[op] = i; // the greatest memory log index is used as rank
      });
    });
    return cellOpsMap;
  };

  // Returns a map keyed by cell index, and whose values are objects of shape
  // {index, cursors}, where cursors lists the cursor names pointing to the
  // cell.
  const getCursorMap =  function (cursorNames, elemCount, core, localMap) {
    const cursorMap = [];
    cursorNames.forEach(function (cursorName) {
      if (localMap.has(cursorName)) {
        const {type, ref} = localMap.get(cursorName);
        const decl = viewVariable(core, cursorName, type, ref.address);
        const cursorPos = decl.value.current.toInteger();
        if (cursorPos >= 0 && cursorPos <= elemCount) {
          const cursor = {name: cursorName};
          if ('store' in decl.value) {
            const cursorPrevPos = decl.value.previous.toInteger();
            if (cursorPrevPos >= 0 && cursorPrevPos <= elemCount) {
              cursor.prev = cursorPrevPos;
            }
          }
          // Add cursor to position's cursors list.
          if (!(cursorPos in cursorMap)) {
            cursorMap[cursorPos] = {index: cursorPos, cursors: [], row: 0};
          }
          cursorMap[cursorPos].cursors.push(cursor);
        }
      }
    });
    return cursorMap;
  };

  // Returns an array of up to maxVisibleCells indices between 0 and elemCount
  // (inclusive), prioritizing cells that have memory operations or cursors.
  const getSelection = function (maxVisibleCells, elemCount, cellOpsMap, cursorMap) {
    const builder = new ArrayViewBuilder(maxVisibleCells, elemCount);
    builder.addMarker(0, pointsByKind.first);
    builder.addMarker(elemCount, pointsByKind.last);
    cellOpsMap.forEach(function (ops, index) {
      if ('load' in ops) {
        builder.addMarker(index, pointsByKind.load, ops.load);
      }
      if ('store' in ops) {
        builder.addMarker(index, pointsByKind.store, ops.store);
      }
    });
    cursorMap.forEach(function (cursor, cursorPos) {
      builder.addMarker(cursorPos, pointsByKind.cursor);
    });
    return builder.getSelection();
  };

  // Returns an array of cursor objects within the selection.
  // Each cursor is modified to contain a 'col' field giving its position in
  // the selection, and a 'row' field such that adjacent cursors in the result
  // are on a different row.
  const getCursors = function (selection, cursorMap) {
    const cursors = [];
    let nextStaggerCol, cursorRow = 0;
    selection.forEach(function (index, col) {
      if (col === undefined)
        col = index;
      if (index in cursorMap) {
        const cursor = cursorMap[index];
        if (col === nextStaggerCol) {
          cursorRow = (cursorRow + 1) % cursorRows;
        } else {
          cursorRow = 0;
        }
        nextStaggerCol = col + 1;
        cursor.col = col;
        cursor.row = cursorRow;
        cursors.push(cursor);
      }
    });
    return cursors;
  };

  //
  // Rendering
  //

  const baseline = function (i) {
    return textLineHeight * (i + 1) - textBaseline;
  };

  const arrowPoints = function (x0, y0, width, height) {
    const dx1 = width;
    const dx2 = width / 5;
    const dy1 = height / 3;
    const dy2 = height;
    return `${x0},${y0} ${x0-dx1},${y0+dy1} ${x0-dx2},${y0+dy1} ${x0-dx2},${y0+dy2} ${x0+dx2},${y0+dy2} ${x0+dx2},${y0+dy1} ${x0+dx1},${y0+dy1} ${x0},${y0}`;
  }

  const drawGrid = function (cells) {
    const elements = [];
    // Column labels and horizontal lines
    const y1 = textLineHeight * 1;
    const y2 = textLineHeight * 2;
    const y3 = baseline(2);
    for (let i = 0, x = 0; i < cells.length; i += 1, x += cellWidth) {
      const cell = cells[i];
      const className = classnames(['h', cell.gap && 'gap']);
      elements.push(<text key={`l${i}`} x={x + cellWidth / 2} y={y3} className="index">{cell.index}</text>);
      elements.push(<line key={`ht${i}`} x1={x} x2={x + cellWidth} y1={y1} y2={y1} className={className} />);
      elements.push(<line key={`hb${i}`} x1={x} x2={x + cellWidth} y1={y2} y2={y2} className={className} />);
    }
    // Vertical lines
    for (let i = 0, x = 0; i <= cells.length; i += 1, x += cellWidth) {
      elements.push(<line key={`v${i}`} x1={x} x2={x} y1={y1} y2={y2} className="v" />);
    }
    return <g className="grid">{elements}</g>;
  };

  const drawCell = function (cell, i) {
    if (cell.gap) {
      return;
    }
    const {position, index, address, content} = cell;
    const y0 = baseline(0);
    const y0a = y0 - (textLineHeight - textBaseline) / 3;
    const y1 = baseline(1);
    return (
      <g key={`C${index}`} transform={`translate(${position * cellWidth},0)`} clipPath="url(#cell)">
        {content && 'previous' in content &&
          <g className="previous-content">
            <text x={cellWidth/2} y={y0}>
              {renderValue(content.previous)}
            </text>
            <line x1={2} x2={cellWidth-2} y1={y0a} y2={y0a}/>
          </g>}
        <text x={cellWidth/2} y={y1} className="current-content">
          {content && renderValue(content.current)}
        </text>
      </g>
    );
  };

  const drawCursor = function (cursor) {
    const {index, cursors, col, row} = cursor;
    const arrowTop = textLineHeight * 3;
    const arrowHeight = minArrowHeight + row * textLineHeight;
    const cursorsY = baseline(3) + arrowHeight;
    const fillColor = '#eef';
    return (
      <g key={`c${index}`} transform={`translate(${col * cellWidth},0)`}>
        <polygon points={arrowPoints(cellWidth/2, arrowTop, 6, arrowHeight)}/>
        <text x={cellWidth/2} y={cursorsY} textAnchor="middle">
          {cursors.map(cursor => cursor.name).join(',')}
        </text>
        <rect x="0" y={textLineHeight} width={cellWidth} height={textLineHeight} fill={fillColor}/>
      </g>
    );
  };

  const onViewChange = function (event) {
    const {value} = event;
    // Prevent vertical panning.
    value.matrix.f = 0;
    const update = {viewState: value};
    self.props.onChange(self.props.directive, update);
  };

  const getViewState = function (controls) {
    const viewState = controls.get('viewState');
    return viewState || ViewerHelper.getDefaultValue();
  };

  self.render = function () {
    const {Frame, controls} = self.props;
    const fullView = controls.get('fullView');
    const {error, cells, cursors} = extractView(fullView);
    if (error) {
      return <Frame {...self.props}>{error}</Frame>;
    }
    const viewState = getViewState(controls);
    return (
      <Frame {...self.props} hasFullView>
        <div className='clearfix' style={{padding: '2px'}}>
          <div style={{width: '100%', height: cellHeight+'px'}}>
            <ViewerResponsive tool='pan' value={viewState} onChange={onViewChange} background='transparent' specialKeys={[]}>
              <svg width={cellWidth * cells.length} height={cellHeight} version="1.1" xmlns="http://www.w3.org/2000/svg">
                <clipPath id="cell">
                  <rect x="0" y="0" width={cellWidth} height={3 * textLineHeight}/>
                </clipPath>
                <g className="array1d">
                  {cursors.map(drawCursor)}
                  {cells.map(drawCell)}
                  {drawGrid(cells)}
                </g>
              </svg>
            </ViewerResponsive>
          </div>
        </div>
      </Frame>
    );
  };

});
