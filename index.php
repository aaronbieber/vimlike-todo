<?php
$response = array('status' => true, 'messages' => array(), 'data' => '');

if(!array_key_exists('action', $_REQUEST) || !strlen($_REQUEST['action'])) {
	$response['status'] = false;
	array_push($response['messages'], 'An action was not given.');
} else {
	if($_SERVER['REQUEST_METHOD'] == 'GET') {
		switch($_GET['action']) {
			case 'load':
				$response = loadList();
				break;

			case 'dir':
				$response = listLists();
				break;
		}
	} elseif($_SERVER['REQUEST_METHOD'] == 'POST') {
		switch($_POST['action']) {
			case 'save':
				$response = saveList();
				break;

			case 'new':
				$response = newList();
				break;

			default:
				$response['status'] = false;
				array_push($response['messages'], 'The action provided is not valid.');
				break;
		}
	}
}

header('Content-type: application/json');
echo json_encode($response);

function newList() {
	global $response;

	if(!array_key_exists('name', $_POST) || !strlen($_POST['name'])) {
		$response['status'] = false;
		array_push($response['messages'], 'A name must be provided.');
	}
	if(!array_key_exists('author', $_POST) || !strlen($_POST['author'])) {
		$response['status'] = false;
		array_push($response['messages'], 'An author must be provided.');
	}
	if($response['status']) {
		$title = urldecode($_POST['name']);
		$name = strtolower(preg_replace('/[^A-Za-z0-9_-]/', '-', $title));

		// open connection to MongoDB server
		$conn = new Mongo('localhost');
		$db = $conn->todo;

		$lists = $db->lists;
		$cursor = $lists->find(array( 'name' => $_GET['list'], 'author' => 'aaron@aaronbieber.com' ));
		if($cursor->hasNext()) {
			$response['status'] = false;
			array_push($response['messages'], 'A list by that name already exists.');
		} else {
			$lists->save(array( 'name' => $name, 'author' => $_POST['author'], 'title' => $_POST['name'] ));
			$items = $db->items;
			$items->save(array(
				'list' => $name,
				'item' => 0,
				'text' => '',
				'depth' => 0,
				'done' => false
			));
			$response['data'] = array( 'name' => $name );
		}
	}

	return $response;
}

function listLists() {
	global $response;

	if(!array_key_exists('author', $_GET) || !strlen($_GET['author'])) {
		$response['status'] = false;
		array_push($response['messages'], 'An author must be provided.');
	} else {
		// open connection to MongoDB server
		$conn = new Mongo('localhost');
		$db = $conn->todo;

		// Get all lists
		$lists = $db->lists;
		$cursor = $lists->find(array( 'author' => $_GET['author'] ));

		$response['data'] = iterator_to_array($cursor, true);
	}

	return $response;
}

function loadList() {
	global $response;

	if(!array_key_exists('list', $_GET) || !strlen($_GET['list'])) {
		$response['status'] = false;
		array_push($response['messages'], 'A list name was not provided.');
	} else {
		try {
			// open connection to MongoDB server
			$conn = new Mongo('localhost');
			$db = $conn->todo;

			// Check for the list first
			$lists = $db->lists;
			$cursor = $lists->find(array( 'name' => $_GET['list'], 'author' => 'aaron@aaronbieber.com' ));
			if($cursor->count()) {
				$list = $cursor->getNext();
				$response['data'] = array( 'title' => $list['title'] );

				// Get the list items
				$collection = $db->items;
				$cursor = $collection->find(array( 'list' => $_GET['list'] ));
				$cursor->sort(array( 'item' => 1 ));

				$response['data']['items'] = iterator_to_array($cursor, true);
			} else {
				// If the list doesn't exist, create it.
				$lists->save(array( 'name' => $_GET['list'], 'author' => 'aaron@aaronbieber.com', 'title' => 'Untitled' ));
				$items = $db->items;
				$items->save(array(
					'list' => $_GET['list'],
					'item' => 0,
					'text' => '',
					'depth' => 0,
					'done' => false
				));
				$response['data'] = array(
					'title' => 'Untitled',
					'items' => iterator_to_array($items->find(array( 'list' => $_GET['list'] )), true)
				);
			}

			// disconnect from server
			$conn->close();
		} catch (MongoConnectionException $e) {
			$response['status'] = false;
			array_push($response['messages'], 'Error connecting to MongoDB server');
		} catch (MongoException $e) {
			$response['status'] = false;
			array_push($response['messages'], 'Error: ' . $e->getMessage());
		}
	}

	return $response;
}

function saveList() {
	global $response;

	if(!array_key_exists('data', $_POST) || (!array_key_exists('list', $_POST) || !strlen($_POST['list']))) {
		$response['status'] = false;
		array_push($response['messages'], 'Save data was not provided.');
	} else {
		$list_name = $_POST['list'];
		$data = json_decode(stripslashes($_POST['data']));
		//$all_items = json_decode($_POST['items']);

		try {
			$conn = new Mongo('localhost');
			$db = $conn->todo;

			// Save the list name
			$lists = $db->lists;
			$list = $lists->find(array( 'name' => $list_name, 'author' => 'aaron@aaronbieber.com' ));
			if($list->hasNext()) {
				$list = $list->getNext();
				$list['title'] = $data->title;
				$lists->save($list);
			} else {
				// Yo shit is in error, son
			}

			// Get ready to save list items
			$items = $db->items;

			$retval = array('new' => array(), 'deleted' => array());
			foreach($data->items as $item) {
				// Check for a delete
				if($item->delete) {
					// Save the ID for the return data.
					array_push($retval['deleted'], $item->_id);
					// Remove the item.
					$items->remove( array( _id => new MongoId($item->_id) ) );
				} else {
					unset($item->delete);

					// Set the ID for pre-existing items we are updating
					$new = false;
					if(strlen($item->_id)) {
						$item->_id = new MongoId($item->_id);
					} else {
						$new = true;
						$new_id = $item->new_id;
						unset($item->new_id);
						unset($item->_id);
					}

					$item->list = $list_name;
					$item_ref = &$item;
					$items->save($item_ref);

					if($new) array_push($retval['new'], array( 'new_id' => $new_id, '_id' => $item_ref->_id->{'$id'} ));
				}
			}
			$response['data'] = $retval;

			// disconnect from server
			$conn->close();
		} catch (MongoConnectionException $e) {
			$response['status'] = false;
			array_push($response['messages'], 'Error connecting to MongoDB server');
		} catch (MongoException $e) {
			$response['status'] = false;
			array_push($response['messages'], 'Error: ' . $e->getMessage());
		}

	}

	// Artificial slowdown so I can see what the hell is going on.
	// TODO Delete this
	return $response;
}
?>
