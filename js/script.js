/* vim-todo
 *
 * Author: Aaron Bieber
 */

(function() {
  'use strict';

  var List = {
    Globals: {
      save_timer: null,
      min_save_delay: 1500,
      save_delay: 1500,
      max_save_delay: 5 * 60 * 1000,
      last_saved: 0,
      list_data: null,
      chain: '',
      chain_timer: null,
      editing: false,
      carat: 0,
      items: 1,
      save_lock: false
    },

    render_items_from_json: function(json) { // {{{1
      for(i in json) {
        var item = json[i];
        var obj = this.render_item(Globals.items, item.done, item.text, item.depth, item._id.$id);
        $('#todo-container ul').append(obj);

        // Apply listeners.
        this.get_task(Globals.items).focus(handle_click_to_edit);
        this.get_task(Globals.items).blur(edit_end);

        this.Globals.items++;
      }
      this.redraw_list();
    },

    redraw_list: function() { // {{{1
      this.render_depth();
      this.fix_corners();
    },

    render_depth: function() { // {{{1
      $('#todo-container ul li').filter(this.filter_active_only).each(function() {
        $(this).css({ 'padding-left': ($(this).data('depth') * 15) + 'px' })
      });
    },

    insert_new_item: function(index, sibling_index) { // {{{1
      console.log('Inserting new item at ' + index + ' from sibling ' + sibling_index);
      this.Globals.save_lock = true;

      // Ensure a numeric argument
      var index = index * 1;
      var sibling_index = sibling_index * 1;
      var new_depth = get_item(sibling_index).data('depth');
      var new_item = render_item(index, false, '', new_depth);

      new_item.data('new_id', uid());

      if(index <= Globals.items - 1) {
        // Increase all carat values greater than or equal to the target index
        $('#todo-container ul li').filter(function() {
          return !$(this).data('delete') && $(this).data('carat') * 1 >= index;
        }).each(function() {
          var this_carat = $(this).data('carat') * 1;
          $(this).data('carat', this_carat + 1);
          $(this).find('div.task').removeClass('focused');
        });
        get_item(index+1).before(new_item);
      } else {
        $('#todo-container ul').append(new_item);
      }

      // Apply listeners.
      get_task(index)
        .focus(handle_click_to_edit)
        .blur(edit_end);

      // Set up the display and begin editing.
      count_carats();
      redraw_list();
      set_carat(index);
      edit_from_start();

      this.Globals.save_lock = false;
    },

    // TODO update references in here
    delete_item: function(carat) { // {{{1
      if(Globals.items == 1) {
        get_task(0).html('');
        return;
      }

      console.log('Delete item ' + carat);

      var item = get_item(carat)
      item.data('delete', true);
      item.data('carat', -1);
      item.fadeOut('fast');

      // Re-number the remaining items.
      $('#todo-container ul li').filter(function() {
        return $(this).data('carat') * 1 > carat;
      }).each(function() {
        var this_carat = $(this).data('carat') * 1;
        $(this).data('carat', this_carat - 1);
        $(this).find('div.task').removeClass('focused');
      });

      count_carats();
      if(Globals.items == 1) {
        get_item(0).data('depth', 0);
        render_depth();
      }

      if(carat <= Globals.items - 1) {
        set_carat(carat);
      } else {
        set_carat(Globals.items - 1);
      }

      save(true);
      redraw_list();
    },

    item_indent: function() { // {{{1
      console.log('Indenting item ' + Globals.carat);
      if(Globals.carat == 0) return;

      var item       = get_item(Globals.carat);     // The current item
      var mom        = get_item(Globals.carat - 1); // The item directly above the current item
      var depth      = item.data('depth');          // The current item's depth
      var moms_depth = mom.data('depth');           // The depth of the item directly above the current item

      // Do not indent more than one greater than the item above
      if(depth == moms_depth + 1) return;

      // Increase the item's depth
      item.data('depth', depth + 1);

      // If this is not the last item, see if we should indent any children
      if(Globals.carat < Globals.items - 1) {
        var all_items = $('#todo-container ul li');
        var indent_items = [];
        for(var i in all_items) {
          var item = $(all_items[i]);
          if(item.data('delete')) continue;
          if(item.data('carat') <= Globals.carat) continue;
          if(item.data('depth') > depth) indent_items.push(item);
          else break;
        }
        $(indent_items).each(function() {
          $(this).data('depth', $(this).data('depth') + 1)
        });
      }

      // Update the display
      redraw_list();
      save(true);
    },

    item_outdent: function() { // {{{1
      console.log('Outdenting item ' + Globals.carat);
      // The current item
      var item = get_item(Globals.carat);
      // The current item's depth
      var depth = item.data('depth');

      if(depth == 0) return;

      // Decrease the item's depth
      item.data('depth', depth - 1);
      // If this is not the last item, see if we should outdent any children
      if(Globals.carat < Globals.items - 1) {
        var all_items = $('#todo-container ul li');
        var indent_items = [];
        for(i in all_items) {
          var item = $(all_items[i]);
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
      redraw_list();
      save(true);
    },

    get_item: function(carat) { // {{{1
      return $('#todo-container ul li').filter(function() {
        return !$(this).data('deleted') && $(this).data('carat') == carat
      });
    },

    get_task: function(carat) { // {{{1
      var item = get_item(carat);
      return $(item).find('div.task');
    },

    get_list_as_json: function() { // {{{1
      var ret = { title: $('#title input').val(), items: [] }
      $('#todo-container ul li').each(function() {
        i = $(this);
        ret.items.push({
          item: i.data('carat'),
          done: !!i.find('input').attr('checked'),
          text: i.find('.task').html(),
          depth: i.data('depth')
        })
      });

      return JSON.stringify(ret);
    },

    get_list_name_from_title: function(title) { // {{{1
      return title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    },

    render_item: function(carat, done, text, depth) { // {{{1
      // Force numeric values
      carat = carat * 1;
      depth = depth * 1;

      // Force Boolean for the done value
      done = !! done;

      return  $('<li>').addClass('focused')
          .data('delete', false)
          .data('editing', false)
          .data('carat', carat)
          .data('depth', depth)
          .append(
            $('<div>').addClass('check').append(
              function() { var e = $('<input type="checkbox">'); if(done) e.attr('checked', 'checked'); return e }
            ),
            $('<div contenteditable>').addClass('task').html(text)
          );
    },

    count_carats: function() { // {{{1
      Globals.items = $('#todo-container ul li').filter(filter_active_only).length;
    },

    filter_active_only: function() { // {{{1
      return !$(this).data('delete');
    },

    reset_chain: function() { // {{{1
      console.log('Chain timeout.');
      Globals.chain = '';
    },

    edit_from_start: function() { // {{{1
      console.log('Begin editing from start at ' + Globals.carat);
      var task = get_task(Globals.carat)
      task.focus();
      edit_start();
    },

    edit_start: function() { // {{{1
      get_item(Globals.carat).data('editing', true);
      Globals.editing = true;
    },

    edit_end: function() { // {{{1
      get_item(Globals.carat).data('editing', false);
      Globals.editing = false;
      save(true);
    },

    handle_indent: function(e) { // {{{1
      if(Globals.editing) return;

      item_indent();
    },

    handle_outdent: function(e) { // {{{1
      if(Globals.editing) return;

      item_outdent();
    },

    handle_i_indent: function(e) { // {{{1
      e.preventDefault();
      item_indent();
    },

    handle_i_outdent: function(e) { // {{{1
      e.preventDefault();
      item_outdent();
    },

    handle_move_carat_to_top: function(e) { // {{{1
      if(Globals.editing) return;

      e.preventDefault();

      // This is a chain command, so it only fires on the second press.
      if(Globals.chain == 'g')
        set_carat(0);
      else if(Globals.chain == null) {
        Globals.chain = 'g';
        window.setTimeout(reset_chain, 500);
      }
    },

    handle_chain_key_down: function(e) { // {{{1
      if(this.Globals.editing) return;

      console.log('Handling chain command; current chain: ' + Globals.chain + ', new key ' + e.handleObj.data);

      if(!Globals.chain.length) {
        this.Globals.chain = e.handleObj.data;
        this.Globals.chain_timer = window.setTimeout(reset_chain, 500);
      } else {
        var full_chain = this.Globals.chain + '-' + e.handleObj.data;
        console.log('Checking for chain ' + full_chain);
        var chain_match = false;
        switch(full_chain) {
          case 'g-g':
            chain_match = true;
            handle_move_carat_to_top(e);
            break;
          case 'd-d':
            chain_match = true;
            delete_item(this.Globals.carat);
            break;
        }

        if(chain_match) {
          this.Globals.chain = '';
          clearTimeout(this.Globals.chain_timer);
        }
      }
    },

    handle_insert_new_item_above: function(e) { // {{{1
      if(Globals.editing) return;
      console.log('Insert a new item above ' + Globals.carat);

      e.preventDefault();
      insert_new_item(Globals.carat, Globals.carat);
    },

    handle_insert_new_item_below: function(e) { // {{{1
      if(Globals.editing) return;
      console.log('Insert a new item below ' + Globals.carat);

      e.preventDefault();
      insert_new_item(Globals.carat + 1, Globals.carat);
    },

    handle_click_to_edit: function(e) { // {{{1
      var new_carat = $(e.target).closest('li').data('carat') * 1;
      console.log('Begin editing from click on ' + new_carat);
      set_carat(new_carat);
      edit_start();
    },

    handle_return_key_down: function(e) { // {{{1
      e.preventDefault();

      if(Globals.editing)
        insert_new_item(Globals.carat + 1, Globals.carat);
      else
        edit_from_start();
    },

    handle_begin_edit_from_start: function(e) { // {{{1
      if(Globals.editing) return;

      e.preventDefault();
      editFromStart();
    },

    handle_begin_edit_from_end: function(e) { // {{{1
      if(Globals.editing) return;

      e.preventDefault();
      editFromEnd();
    },

    handle_move_carat_to_end: function(e) { // {{{1
      if(Globals.editing) return;

      e.preventDefault();
      setCarat(Globals.items-1);
    },

    handle_toggle_task: function(e) { // {{{1
      if(Globals.editing) return;

      e.preventDefault();
      toggleTask(carat);
    },

    handle_down: function(e) { // {{{1
      if(Globals.editing) return;

      if(Globals.carat < Globals.items-1)
        set_carat(Globals.carat+1);
    },

    handle_up: function(e) { // {{{1
      if(Globals.editing) return;

      if(Globals.carat > 0)
        set_carat(Globals.carat-1);
    },

    handle_esc: function(e) { // {{{1
      if(!Globals.editing) return;

      e.preventDefault();
      get_task(Globals.carat).blur();
    },

    set_carat: function(c) { // {{{1
      var new_carat = c * 1;
      this.Globals.carat = new_carat;
      $('#todo-container ul li').removeClass('focused');
      this.get_item(this.Globals.carat).addClass('focused');
      this.fix_corners();
    },

    fix_corners: function() { // {{{1
      $('#todo-container ul li').css({ 'border-radius': '0' });

      if(this.Globals.carat == 0)
        this.get_item(this.Globals.carat).css({ 'border-top-left-radius': '5px' });

      if(this.Globals.carat == this.Globals.items - 1)
        this.get_item(this.Globals.carat).css({ 'border-bottom-left-radius': '5px' });
    },

    toggle_task: function(carat) { // {{{1
      cb = this.get_item(carat).find('input:checkbox');
      cb[0].checked = !cb[0].checked;
    },

    load: function(callback) { // {{{1
      var list_name = unescape(location.hash.replace(/^#/, ''));
      if (!list_name.length) {
        // If there is no list name, it's a new list.
        console.log('Rendering default item.');
        $('#todo-container ul').append(render_item(0, false, '', 0));
        get_task(0)
          .focus(handle_click_to_edit)
          .blur(edit_end);

        fix_corners();
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
            this.list_object.render_items_from_json(data.data.items);
            this.list_object.Globals.list_data = this.list_object.get_list_as_json();
          this.list_object.set_carat(0);
          this.callback();
        }, { list_object: this, callback: callback })
      });
    },

    save: function(immediate) { // {{{1
      var list_title = $('input[name=title]').val();
      var list_name = this.get_list_name_from_title(list_title);
      if (!list_name.length) {
        console.log('No list name; not saving.');
        return;
      }

      /* If the user is going nuts making quick changes, skip saving when the
       * interval is shorter than the min save delay. If the user is currently
       * editing, keep the delay at the minimum but don't save yet.
       */
      if(this.Globals.save_lock) {
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
      this.Globals.last_saved = Date.now();

      var new_list_data = this.get_list_as_json();
      //unescape(location.hash.replace(/^#/, ''));
      printArray(new_list_data);
      if(new_list_data !== this.Globals.list_data) {
        // If saving immediately, clear any pending save timer.
        console.log('Data has changed, preparing to save...');
        if(immediate) window.clearTimeout(save_timer);

        this.Globals.save_lock = true;
        $('#save-status').addClass('saving').find('span').html('Saving...');
        $.ajax('index.php', {
          type: 'post',
          data: { action: 'save', list: list_name, data: this.get_list_as_json() },
          success: $.proxy(function(data, textStatus, jqXHR) {
            if(data.status) {
              console.log('Successful save.');
              console.log(data.data);
              //pruneDeleted(data.data);
              //serverRefresh();

              //updateItems(data.data);
              this.Globals.list_data = this.get_list_as_json();

              $('#save-status').removeClass('saving').find('span').html('Saved');
              location.hash = '#' + list_name;

              // Reset the save delay.
              this.Globals.save_delay = min_save_delay;
              this.Globals.save_timer = window.setTimeout($.proxy(this.save, this), this.save_delay);
              this.Globals.save_lock = false;
            }
          }, this)
        });
      } else {
        console.log('There have been no changes.');
        // Get 1% closer to the maximum save delay.
        var add_delay = Math.round((max_save_delay - save_delay) * 0.005);
        console.log('Adding '+add_delay+' milliseconds ('+(add_delay/1000)+' seconds) to the save delay.');
        this.Globals.save_delay = this.Globals.save_delay + add_delay;
        // Don't exceed the max.
        if(this.Globals.save_delay > this.Globals.max_save_delay)
          this.Globals.save_delay = this.Globals.max_save_delay;
        console.log('Saving in ' + this.Globals.save_delay + ' milliseconds (' + (this.Globals.save_delay/1000) + ' seconds).');
        // Set the timer.
        this.Globals.save_timer = window.setTimeout($.proxy(this.save, this), this.Globals.save_delay);
      }
    },

    init: function() {
      // The title
      $('#title input').focus(this.edit_start).blur(this.edit_end);

      // The first letters of supported "chains"
      $(document).bind('keydown', 'd', this.handle_chain_key_down);
      $(document).bind('keydown', 'g', this.handle_chain_key_down);
      $(document).bind('keydown', 'c', this.handle_chain_key_down);

      // Moving around.
      $(document).bind('keydown', 'j', this.handle_down);
      $(document).bind('keydown', 'k', this.handle_up);
      $(document).bind('keydown', 'down', this.handle_down);
      $(document).bind('keydown', 'up', this.handle_up);
      $(document).bind('keydown', 'shift+g', this.handle_move_carat_to_end);

      // Start editing at the beginning.
      $(document).bind('keydown', 'return', this.handle_return_key_down);
      $(document).bind('keydown', 'i', this.handle_begin_edit_from_start);
      $(document).bind('keydown', 'shift+i', this.handle_begin_edit_from_start);

      // Start editing at the end.
      $(document).bind('keydown', 'shift+a', this.handle_begin_edit_from_end);

      // End editing.
      $(document).bind('keydown', 'esc', this.handle_esc);

      // Inserting new items.
      $(document).bind('keydown', 'o', this.handle_insert_new_item_below);
      $(document).bind('keydown', 'shift+o', this.handle_insert_new_item_above);

      // Check/uncheck
      $(document).bind('keydown', 'x', this.handle_toggle_task);

      // Indent/outdent
      $(document).bind('keydown', 'h', this.handle_outdent);
      $(document).bind('keydown', 'l', this.handle_indent);
      $(document).bind('keydown', 'shift+tab', this.handle_i_outdent);
      $(document).bind('keydown', 'tab', this.handle_i_indent);

      // Accessing the help.
      $(document).bind('keydown', 'shift+/', function() { if(this.Globals.editing) return; $('#help').click(); });
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
            insertNewItem(Globals.items, Globals.items);
            getItem(Globals.items - 1).find('.task').html(line);
          });
        }, 100)
      });

      // Load the requested list.
      this.load($.proxy(this.save, this));
    }
  }

  List.init();
})(); // }}}

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

  Globals.list_data = get_list_as_json();
}

function prune(id) {
  console.log('Pruning '+id);
  deleted_item = getItemById(id);
  carat = deleted_item.data('carat');
  deleted_item.detach();

  countCarats();
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

function editFromEnd() {
  elm = getTask(carat);
  elm.focus();
  editStart();
  setEndOfContenteditable(elm[0]);
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
        //updateItemsFromJSON(data.data);
        Globals.list_data = get_list_as_json();
    }
  });
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

