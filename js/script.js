/* vim-todo
 *
 * Author: Aaron Bieber
 */

/* Globals */
var carat = 0;
var items = 0;
var editing = false;
var chain = null;
var chainTimer = null;
var undo_list = [];
var list_name;
var list_data;
var save_lock = false;

var save_timer;
var min_save_delay = 1500;
var save_delay = 1500;
var max_save_delay = 5*60*1000;
var last_saved;

function uid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function printArray(arr) {
  if(typeof arr == 'string') arr = JSON.parse(arr);
  out = "";
  console.log('{ title: "'+arr.title+'" }');
  for(i in arr.items) {
    o = arr.items[i];
    out += '{ id:'+((o._id && o._id.$id) ? o._id.$id : o._id)+', item:'+o.item+', ';
    if(o.delete) out += 'delete: '+o.delete+', ';
    out += 'text:'+o.text+' }\n';
  }
  console.log(out);
}

function renderItemsFromJSON(json) {
  for(i in json) {
    item = json[i];
    obj = renderItem(items, item.done, item.text, item.depth, item._id.$id);
    $('#todo-container ul').append(obj);

    // Apply listeners.
    getTask(items).focus(handle_clickToEdit);
    getTask(items).blur(editEnd);

    items++;
  }
  redrawList();
}

function updateItemsFromJSON(json) {
  console.log('Updating from...');
  printArray(json);
  for(i in json) {
    item = json[i];
    that = getItemById(item._id.$id);

    that.data('depth', item.depth)
      .data('id', item._id.$id)
      .find('div.task')
      .closest('input').attr('checked', item.done);

    if(!that.data('editing'))
      that.find('div.task').html(item.text);
  }
  redrawList();
}

function updateItems(json) {
  // Assign server IDs to new items
  for(i in json.new) {
    item = json.new[i];
    console.log('Updating local '+item.new_id+' with '+item._id);
    getItemByNewId(item.new_id).data('id', item._id);
  }

  for(i in json.deleted)
    prune(json.deleted[i]);

  list_data = get_list_as_json();
}

function prune(id) {
  console.log('Pruning '+id);
  deleted_item = getItemById(id);
  carat = deleted_item.data('carat');
  deleted_item.detach();

  countCarats();
}

function filter_activeOnly() {
  return !$(this).data('delete');
}

function getChildren(carat) {
  $('#todo-container ul li').filter(function() {
    return $(this).data('carat') > carat;
  });
}

function renderItem(carat, done, text, depth, id) {
  // Force numeric values
  carat = carat*1;
  depth = depth*1;
  // Force Boolean for the done value
  done = !!done;

  return  $('<li>').addClass('focused')
      .data('delete', false)
      .data('editing', false)
      .data('carat', carat)
      .data('depth', depth)
      .data('id', id || '')
      .append(
        $('<div>').addClass('check').append(
          function() { e = $('<input type="checkbox">'); if(done) e.attr('checked', 'checked'); return e }
        ),
        $('<div contenteditable>').addClass('task').html(text)
      );
}

function redrawList() {
  renderDepth();
  fixCorners();
}

function fixCorners() {
  $('#todo-container ul li').css({ 'border-radius': '0' });

  if(carat == 0)
    getItem(carat).css({ 'border-top-left-radius': '5px' });

  if(carat == items - 1)
    getItem(carat).css({ 'border-bottom-left-radius': '5px' });
}

function getItemById(id) {
  return $('#todo-container ul li').filter(function() {
    return $(this).data('id') == id;
  });
}

function getItemByNewId(id) {
  return $('#todo-container ul li').filter(function() {
    return $(this).data('new_id') == id;
  });
}

function getItem(carat) {
  return $('#todo-container ul li').filter(function() {
    return !$(this).data('deleted') && $(this).data('carat') == carat
  });
}

function getTask(carat) {
  return $('#todo-container ul li').filter(function() {
    return !$(this).data('deleted') && $(this).data('carat') == carat
  }).find('div.task');
}

function renderDepth() {
  $('#todo-container ul li').filter(filter_activeOnly).each(function() {
    $(this).css({ 'padding-left': ($(this).data('depth') * 15) + 'px' })
  });
}

function insertNewItem(index, sibling_index) {
  save_lock = true;

  // Ensure a numeric argument
  index = index * 1;
  sibling_index = sibling_index * 1;

  new_depth = getItem(sibling_index).data('depth');
  var new_item = renderItem(index, false, '', new_depth);
  new_item.data('new_id', uid());

  if(index <= items - 1) {
    // Increase all carat values greater than or equal to the target index
    $('#todo-container ul li').filter(function() {
      return !$(this).data('delete') && $(this).data('carat') * 1 >= index;
    }).each(function() {
      this_carat = $(this).data('carat') * 1;
      $(this).data('carat', this_carat + 1);
      $(this).find('div.task').removeClass('focused');
    });
    getItem(index+1).before(new_item);
  } else {
    $('#todo-container ul').append(new_item);
  }

  // Apply listeners.
  getTask(index).focus(handle_clickToEdit);
  getTask(index).blur(editEnd);
  getTask(index).bind('input propertychange', function(e) {
    console.log('Input received data.');
  });

  // Set up the display and begin editing.
  countCarats();
  redrawList();
  setCarat(index);
  editFromStart();

  save_lock = false;
}

function handle_insertNewItemAbove(e) {
  if(editing) return;

  e.preventDefault();
  insertNewItem(carat, carat);
}

function handle_insertNewItemBelow(e) {
  if(editing) return;

  e.preventDefault();
  insertNewItem(carat + 1, carat);
}

function handle_i_insertNewItemBelow(e) {
  if(!editing) return;

  e.preventDefault();
  insertNewItem(carat + 1, carat);
}

function countCarats() {
  items = $('#todo-container ul li').filter(filter_activeOnly).length;
}

function setCarat(c) {
  //console.log('set carat to '+c);
  new_carat = c * 1;
  carat = new_carat;
  $('#todo-container ul li').removeClass('focused');
  getItem(carat).addClass('focused');
  fixCorners();
}

function toggleTask(carat) {
  cb = getItem(carat).find('input:checkbox');
  //console.log(cb);
  cb[0].checked = !cb[0].checked;
}

function handleDown(e) {
  if(editing) return;

  if(carat < items-1)
    setCarat(carat+1);
}

function handleUp(e) {
  if(editing) return;

  if(carat > 0)
    setCarat(carat-1);
}

function handleEsc(e) {
  if(!editing) return;

  e.preventDefault();
  getTask(carat).blur();
  //editEnd();
}

function editStart() {
  getItem(carat).data('editing', true);
  editing = true;
}

function editEnd() {
  getItem(carat).data('editing', false);
  editing = false;
  save(true);
}

function editFromStart() {
  console.log('Begin editing from start at '+carat);
  getTask(carat).focus();
  editStart();
}

function editFromEnd() {
  elm = getTask(carat);
  elm.focus();
  editStart();
  setEndOfContenteditable(elm[0]);
}

function handle_clickToEdit(e) {
  new_carat = $(e.target).closest('li').data('carat') * 1;
  console.log('Begin editing from click on '+new_carat);
  setCarat(new_carat);
  editStart();
}

function handle_returnKeyDown(e) {
  e.preventDefault();

  if(editing)
    insertNewItem(carat + 1, carat);
  else
    editFromStart();
}

function handle_beginEditFromStart(e) {
  if(editing) return;

  e.preventDefault();
  editFromStart();
}

function handle_beginEditFromEnd(e) {
  if(editing) return;

  e.preventDefault();
  editFromEnd();
}

function handle_moveCaratToEnd(e) {
  if(editing) return;

  e.preventDefault();
  setCarat(items-1);
}

function handle_toggleTask(e) {
  if(editing) return;

  e.preventDefault();
  toggleTask(carat);
}

function resetchain() {
  chain = null;
}

function handle_moveCaratToTop(e) {
  if(editing) return;

  e.preventDefault();

  // This is a chain command, so it only fires on the second press.
  if(chain == 'g')
    setCarat(0);
  else if(chain == null) {
    chain = 'g';
    window.setTimeout(resetchain, 500);
  }
}

function deleteItem(carat) {
  if(items == 1) {
    getTask(0).html('');
    return;
  }

  console.log('Delete item '+carat);

  item = getItem(carat)
  item.data('delete', true);
  item.data('carat', -1);
  item.fadeOut('fast');

  // Re-number the remaining items.
  $('#todo-container ul li').filter(function() {
    return $(this).data('carat') * 1 > carat;
  }).each(function() {
    this_carat = $(this).data('carat') * 1;
    $(this).data('carat', this_carat - 1);
    $(this).find('div.task').removeClass('focused');
  });

  countCarats();
  if(items == 1) {
    getItem(0).data('depth', 0);
    renderDepth();
  }

  if(carat <= items - 1) {
    setCarat(carat);
  } else {
    setCarat(items - 1);
  }

  save(true);
  redrawList();
}

function handle_chainKeyDown(e) {
  if(editing) return;

  if(chain == null) {
    chain = e.handleObj.data;
    chainTimer = window.setTimeout(resetchain, 500);
  } else {
    full_chain = chain + '-' + e.handleObj.data;
    chain_match = false;
    switch(full_chain) {
      case 'g-g':
        chain_match = true;
        handle_moveCaratToTop(e);
        break;
      case 'd-d':
        chain_match = true;
        deleteItem(carat);
        break;
    }

    if(chain_match) {
      chain = null;
      clearTimeout(chainTimer);
    }
  }
}

function itemIndent() {
  console.log('Indenting item '+carat);
  if(carat == 0) return;

  // The current item
  item = getItem(carat);
  // The item directly above the current item
  mom = getItem(carat - 1);
  // The current item's depth
  depth = item.data('depth');
  // The depth of the item directly above the current item
  moms_depth = mom.data('depth');

  //console.log('indenting from '+depth+' whilst mother\'s is '+moms_depth);

  // Do not indent more than one greater than the item above
  if(depth == moms_depth + 1) return;

  // Increase the item's depth
  item.data('depth', depth + 1);
  // If this is not the last item, see if we should indent any children
  if(carat < items - 1) {
    all_items = $('#todo-container ul li');
    indent_items = [];
    for(i in all_items) {
      item = $(all_items[i]);
      if(item.data('delete')) continue;
      if(item.data('carat') <= carat) continue;
      if(item.data('depth') > depth) indent_items.push(item);
      else break;
    }
    $(indent_items).each(function() {
      $(this).data('depth', $(this).data('depth') + 1)
    });
  }

  // Update the display
  redrawList();
  save(true);
}

function itemOutdent() {
  // The current item
  item = getItem(carat);
  // The current item's depth
  depth = item.data('depth');

  if(depth == 0) return;

  // Decrease the item's depth
  item.data('depth', depth - 1);
  // If this is not the last item, see if we should outdent any children
  if(carat < items - 1) {
    all_items = $('#todo-container ul li');
    indent_items = [];
    for(i in all_items) {
      item = $(all_items[i]);
      if(item.data('delete')) continue;
      if(item.data('carat') <= carat) continue;
      if(item.data('depth') > depth) indent_items.push(item);
      else break;
    }
    $(indent_items).each(function() {
      $(this).data('depth', $(this).data('depth') - 1)
    });
  }

  // Update the display
  redrawList();
  save(true);
}

function handle_indent(e) {
  if(editing) return;

  itemIndent();
}

function handle_outdent(e) {
  if(editing) return;

  itemOutdent();
}

function handle_i_indent(e) {
  e.preventDefault();
  itemIndent();
}

function handle_i_outdent(e) {
  e.preventDefault();
  itemOutdent();
}

function get_list_name_from_title(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function setEndOfContenteditable(contentEditableElement) {
    var range,selection;
    if(document.createRange)//Firefox, Chrome, Opera, Safari, IE 9+
    {
        range = document.createRange();//Create a range (a range is a like the selection but invisible)
        range.selectNodeContents(contentEditableElement);//Select the entire contents of the element with the range
        range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
        selection = window.getSelection();//get the selection object (allows you to change selection)
        selection.removeAllRanges();//remove any selections already made
        selection.addRange(range);//make the range you have just created the visible selection
    }
    else if(document.selection)//IE 8 and lower
    { 
        range = document.body.createTextRange();//Create a range (a range is a like the selection but invisible)
        range.moveToElementText(contentEditableElement);//Select the entire contents of the element with the range
        range.collapse(false);//collapse the range to the end point. false means collapse to end rather than the start
        range.select();//Select the range (make it the visible selection
    }
}

function vim() {
  $('#vim').fadeIn();
  window.setTimeout(function() { $('#vim').fadeOut() }, 2000);
}

function get_list_as_json() {
  ret = { title: $('#title input').val(), items: [] }
  $('#todo-container ul li').each(function() {
    i = $(this);
    ret.items.push({
      _id: i.data('id'),
      new_id: i.data('new_id') || '',
      delete: !!i.data('delete'),
      item: i.data('carat'),
      done: !!i.find('input').attr('checked'),
      text: i.find('.task').html(),
      depth: i.data('depth')
    })
  });
  return JSON.stringify(ret);
}

function load(callback) {
  var list_name = unescape(location.hash.replace(/^#/, ''));
  if (!list_name.length) {
    return;
  }
  console.log('Loading ' + list_name);
  //list_name = (location.href.replace(/^.*\?/,'').replace(/#/,'').length) ? location.href.replace(/^.*\?/,'').replace(/#/,'') : 'list-one';

  $.ajax('index.php', {
    data: {
      action: 'load',
      list: list_name
    },
    dataType: 'json',
    success: $.proxy(function(data, textStatus, jqXHR) {
      if(data.status)
        $('#title input').val(data.data.title);
        renderItemsFromJSON(data.data.items);
        list_data = get_list_as_json();
      setCarat(0);
      this();
    }, callback)
  });
}

function serverRefresh() {
  var list_name = unescape(location.hash.replace(/^#/, ''));
  //list_name = (location.href.replace(/^.*\?/,'').replace(/#/,'').length) ? location.href.replace(/^.*\?/,'').replace(/#/,'') : 'list-one';
  $.ajax('index.php', {
    data: {
      list: list_name
    },
    dataType: 'json',
    success: function(data, textStatus, jqXHR) {
      if(data.status)
        updateItemsFromJSON(data.data);
        list_data = get_list_as_json();
    }
  });
}

function save(immediate) {
  var list_title = $('input[name=title]').val();
  var list_name = get_list_name_from_title(list_title);
  if (!list_name.length) {
    console.log('No list name; not saving.');
    return;
  }
  /* If the user is going nuts making quick changes, skip saving when the
   * interval is shorter than the min save delay. If the user is currently
   * editing, keep the delay at the minimum but don't save yet.
   */
  if(save_lock) {
    console.log('There is a save lock in place; skipping save.');
    window.clearTimeout(save_timer);
    save_timer = window.setTimeout(save, min_save_delay);
  
    // Set the last saved time (this is the last time a save was attempted)
    last_saved = Date.now();

    return;
  }

  console.log('It has been '+(Date.now() - last_saved)+' milliseconds since the last save.');
  if(Date.now() - last_saved < min_save_delay || editing) {
    window.clearTimeout(save_timer);
    save_timer = window.setTimeout(save, min_save_delay);
    console.log('Document is changing too quickly. Reset the save delay and skip saving.');

    // Set the last saved time (this is the last time a save was attempted)
    last_saved = Date.now();

    return;
  }

  // Set the last saved time (this is the last time a save was attempted)
  last_saved = Date.now();

  new_list_data = get_list_as_json();
  //unescape(location.hash.replace(/^#/, ''));
  printArray(new_list_data);
  if(new_list_data !== list_data) {
    // If saving immediately, clear any pending save timer.
    console.log('Data has changed, preparing to save...');
    if(immediate) window.clearTimeout(save_timer);

    save_lock = true;
    $('#save-status').addClass('saving').find('span').html('Saving...');
    $.ajax('index.php', {
      type: 'post',
      data: { action: 'save', list: list_name, data: get_list_as_json() },
      success: function(data, textStatus, jqXHR) {
        if(data.status) {
          console.log('Successful save. Pruning deletes...');
          console.log(data.data);
          //pruneDeleted(data.data);
          //serverRefresh();
          
          updateItems(data.data);

          $('#save-status').removeClass('saving').find('span').html('Saved');
          location.hash = '#' + list_name;

          // Reset the save delay.
          save_delay = min_save_delay;
          save_timer = window.setTimeout(save, save_delay);
          save_lock = false;
        }
      }
    });
  } else {
    console.log('There have been no changes.');
    // Get 1% closer to the maximum save delay.
    add_delay = Math.round((max_save_delay - save_delay) * 0.005);
    console.log('Adding '+add_delay+' milliseconds ('+(add_delay/1000)+' seconds) to the save delay.');
    save_delay = save_delay + add_delay;
    // Don't exceed the max.
    if(save_delay > max_save_delay) save_delay = max_save_delay;
    console.log('Saving in '+save_delay+' milliseconds ('+(save_delay/1000)+' seconds).');
    // Set the timer.
    save_timer = window.setTimeout(save, save_delay);
  }
}

function loadList(e) {
  e.preventDefault();
  location.hash = '#' + $(e.target).data('list');
  load(save);
}

function loadListMenu(e) {
  e.preventDefault();

  $('#lists ul li').filter(function() { return !$(this).hasClass('new') }).detach();

  $.ajax('index.php', {
    data: { action: 'dir', author: 'aaron@aaronbieber.com' },
    success: function(data, textStatus, jqXHR) {
      if(data.status) {
        for(i in data.data) {
          link = $('<li>').html(data.data[i].title).data('list', data.data[i].name);
          $('#lists ul').append(link);
          link.click(loadList);
        }

        $('#lists').css({
          left: ($('div.nav ul li').first().position().left - (parseInt($('#lists').css('width')) - 101)) + 'px'
        }).fadeIn('fast');
      }
    }
  });
}

var overListMenu = false;
function listMenu_mouseenter() {
  console.log('Over list menu');
  overListMenu = true;
}

function listMenu_mouseleave() {
  console.log('Out of list menu');
  if(overListMenu)
    $('#lists').fadeOut('fast');
}

function handle_create_list(e) {
  e.preventDefault();

  if(!$('#lists input').val().length)
    return;

  var new_list_name = $('#lists input').val();
  if(new_list_name.length > 50)
    return;

  create_list(new_list_name);
}

function create_list(name) {
  $.ajax('index.php', {
    type: 'post',
    data: { action: 'new', author: 'aaron@aaronbieber.com', name: new_list_name },
    success: function(data, textStatus, jqXHR) {
      if(data.status) {
        location.hash = '#' + get_list_name_from_title(new_list_name);
        //location.search = '?'+data.data.name;
        load(save);
      } else {
        alert(data.messages.join(', '));
      }
    }
  });
}

$(document).ready(function() {
  // The title
  $('#title input').focus(editStart).blur(editEnd);

  // The first letters of supported "chains"
  $(document).bind('keydown', 'd', handle_chainKeyDown);
  $(document).bind('keydown', 'g', handle_chainKeyDown);
  $(document).bind('keydown', 'c', handle_chainKeyDown);

  // Moving around.
  $(document).bind('keydown', 'j', handleDown);
  $(document).bind('keydown', 'k', handleUp);
  $(document).bind('keydown', 'down', handleDown);
  $(document).bind('keydown', 'up', handleUp);
  $(document).bind('keydown', 'shift+g', handle_moveCaratToEnd);
  //$(document).bind('keydown', 'g', handle_moveCaratToTop);

  // Start editing at the beginning.
  $(document).bind('keydown', 'return', handle_returnKeyDown);
  $(document).bind('keydown', 'i', handle_beginEditFromStart);
  $(document).bind('keydown', 'shift+i', handle_beginEditFromStart);

  // Start editing at the end.
  $(document).bind('keydown', 'shift+a', handle_beginEditFromEnd);

  // End editing.
  $(document).bind('keydown', 'esc', handleEsc);

  // Inserting new items.
  $(document).bind('keydown', 'o', handle_insertNewItemBelow);
  $(document).bind('keydown', 'shift+o', handle_insertNewItemAbove);

  // Check/uncheck
  $(document).bind('keydown', 'x', handle_toggleTask);

  // Indent/outdent
  $(document).bind('keydown', 'h', handle_outdent);
  $(document).bind('keydown', 'l', handle_indent);
  $(document).bind('keydown', 'shift+tab', handle_i_outdent);
  $(document).bind('keydown', 'tab', handle_i_indent);

  // Accessing the help.
  $(document).bind('keydown', 'shift+/', function() { if(editing) return; $('#help').click(); });
  $('#help').click(function(e) { $(e.target).fadeOut(function() { $('#help-text').fadeIn(); }) });
  $('#help-text .done').click(function(e) { $(e.target).closest('div').fadeOut(function() { $('#help').fadeIn(); }) });

  // List handling stuff
  $('div.nav ul li a').click(loadListMenu);
  $('#lists').mouseenter(listMenu_mouseenter);
  $('#lists').mouseleave(listMenu_mouseleave);
  $('#lists a').click(handle_create_list);
  $('#lists input').bind('keydown', 'return', handle_create_list);

  $('#paste_box').bind('paste', function(e) {
    var element = $(e.target);
    window.setTimeout(function() {
      var pasted_text = element.val();
      var pasted_lines = pasted_text.split(/\n/);
      pasted_lines = _.reject(pasted_lines, function(line) { return !line.length; });
      _.each(pasted_lines, function(line) {
        console.log('Adding ' + line);
        insertNewItem(items, items);
        getItem(items-1).find('.task').html(line);
      });
    }, 100)
  });

  // Load the requested list.
  load(save);
});
