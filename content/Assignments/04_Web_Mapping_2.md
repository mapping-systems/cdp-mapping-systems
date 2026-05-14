# 04. Web Mapping (Part 2)

In this assignment, we will build on the API tutorial completed in class and further extend our ability to visualize data on the web. We will *extend* the web map we created previously by adding data-driven styling elements to the map.

## Identifying a variable
Return to your Supabase dashboard and inspect the different variables in our table. We can see a number of variables that indicate whether the restaurant offers sidewalk, roadway, or both types of seating, as well as whether the seating structure is compliant. Choose one of these variables to visualize on the map.

Note that each restaurant may have multiple observations if they were scored multiple times.

## Styling the map
In the `map.js` file, you will need to extend your previous code that adds the open restaurants data on click events to the map to display a data-driven property based on the variable you chose. You can use the `paint` properties of the layer to achieve this goal. You could alternately use the `distance` property we created in the API setup as a way to style the points instead of the categorical field, but ultimately must represent both to the user. Consider how point color, size, opacity, and popups can be used to convey information effectively.

## Submission instructions
Please submit:
- a screenshot of the web map you created showing the data-driven styling
- a description of the variable you chose, how you styled the map, and the rationale behind your choices. Your visualization should show some combination of the variable you chose and the distance from the user.
- a link to the folder containing your web map files (HTML, CSS, JS, etc.). I should be able to launch and run the web map from this link.